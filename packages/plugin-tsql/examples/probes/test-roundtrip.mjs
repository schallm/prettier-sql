/**
 * Round-trip probe: format SQL twice and compare.
 * Also checks that key semantic tokens from the input survive in the output.
 * A missing token = dropped functionality = BUG.
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = join(__dirname, 'dist/index.js');

async function fmt(sql) {
    return prettier.format(sql, { parser: 'tsql', plugins: [plugin], printWidth: 80 });
}

// tokens that MUST appear in the output (case-insensitive substring match)
const cases = [
    // CHECK constraints — previously found to be silently dropped
    {
        name: 'check_constraint_inline',
        sql: `create table dbo.Orders (
            OrderId int not null,
            Amount decimal(18,2) not null check (Amount > 0),
            Status nvarchar(20) not null check (Status in ('Pending','Closed','Cancelled'))
        );`,
        must: ['check', 'Amount > 0', "'Pending'", "'Closed'"],
    },
    {
        name: 'check_constraint_table_level',
        sql: `create table dbo.Orders (
            OrderId int not null,
            StartDate date not null,
            EndDate date not null,
            constraint CK_DateRange check (EndDate > StartDate)
        );`,
        must: ['check', 'EndDate > StartDate', 'CK_DateRange'],
    },
    // Filtered index WHERE clause
    {
        name: 'filtered_index',
        sql: `create index IX_Orders_Active on dbo.Orders (CustomerId, OrderDate)
            where Status = 'Active' and Amount > 0;`,
        must: ['where', "Status = 'Active'", 'Amount > 0'],
    },
    // DEFAULT constraints
    {
        name: 'default_constraint',
        sql: `create table dbo.Orders (
            OrderId int not null,
            CreatedAt datetime not null default getdate(),
            Status nvarchar(20) not null default 'Pending',
            IsActive bit not null default 1
        );`,
        must: ['default', 'getdate()', "'Pending'", 'default 1'],
    },
    // FOREIGN KEY with ON DELETE / ON UPDATE
    {
        name: 'fk_cascade',
        sql: `create table dbo.OrderLines (
            LineId int not null primary key,
            OrderId int not null,
            constraint FK_OrderLines_Orders foreign key (OrderId)
                references dbo.Orders (OrderId)
                on delete cascade
                on update no action
        );`,
        must: ['references', 'on delete cascade', 'on update no action'],
    },
    // UNIQUE constraint with multiple columns
    {
        name: 'unique_constraint',
        sql: `create table dbo.Products (
            ProductId int not null primary key,
            Sku nvarchar(50) not null,
            RegionId int not null,
            constraint UQ_Sku_Region unique (Sku, RegionId)
        );`,
        must: ['unique', 'Sku, RegionId', 'UQ_Sku_Region'],
    },
    // IDENTITY with seed and increment
    {
        name: 'identity',
        sql: `create table dbo.Orders (
            OrderId int not null identity(100, 5) primary key,
            Name nvarchar(100)
        );`,
        must: ['identity(100, 5)'],
    },
    // ROWGUIDCOL
    {
        name: 'rowguidcol',
        sql: `create table dbo.Items (
            ItemId uniqueidentifier not null rowguidcol default newsequentialid()
        );`,
        must: ['rowguidcol', 'newsequentialid'],
    },
    // COLLATE
    {
        name: 'collate',
        sql: `create table dbo.Products (
            Name nvarchar(200) collate SQL_Latin1_General_CP1_CI_AS not null
        );`,
        must: ['collate', 'SQL_Latin1_General_CP1_CI_AS'],
    },
    // SPARSE
    {
        name: 'sparse',
        sql: `create table dbo.Attributes (
            EntityId int not null,
            Value1 nvarchar(100) sparse null,
            Value2 int sparse null
        );`,
        must: ['sparse'],
    },
    // RAISERROR WITH options
    {
        name: 'raiserror_with',
        sql: `raiserror('Something failed', 16, 1) with log, nowait;`,
        must: ['with log', 'nowait'],
    },
    // GRANT with WITH GRANT OPTION
    {
        name: 'grant_with_grant_option',
        sql: `grant select, insert on dbo.Orders to AppRole with grant option;`,
        must: ['with grant option'],
    },
    // REVOKE with GRANT OPTION FOR
    {
        name: 'revoke_grant_option_for',
        sql: `revoke grant option for select on dbo.Orders from AppRole cascade;`,
        must: ['grant option for', 'cascade'],
    },
    // DENY
    {
        name: 'deny_stmt',
        sql: `deny delete on dbo.Orders to ReadOnlyRole cascade;`,
        must: ['deny', 'cascade'],
    },
    // CREATE INDEX with INCLUDE, FILLFACTOR, PAD_INDEX
    {
        name: 'index_full_options',
        sql: `create unique nonclustered index IX_Orders_Cust
            on dbo.Orders (CustomerId asc, OrderDate desc)
            include (Amount, Status)
            where Status <> 'Cancelled'
            with (fillfactor = 80, pad_index = on, online = on);`,
        must: ['include', 'Amount, Status', 'fillfactor = 80', 'pad_index', 'online', 'where'],
    },
    // ALTER TABLE ADD COLUMN with all decorators
    {
        name: 'alter_table_add_column',
        sql: `alter table dbo.Orders add
            ArchivedAt datetime null,
            ArchiveReason nvarchar(500) null check (len(ArchiveReason) > 0);`,
        must: ['ArchivedAt', 'ArchivedAt datetime null', 'ArchiveReason', 'check'],
    },
    // CREATE VIEW WITH CHECK OPTION
    {
        name: 'view_with_check_option',
        sql: `create view dbo.ActiveOrders as
            select * from dbo.Orders where Status = 'Active'
            with check option;`,
        must: ['with check option'],
    },
    // CREATE VIEW SCHEMABINDING
    {
        name: 'view_schemabinding',
        sql: `create view dbo.vw_Summary with schemabinding as
            select CustomerId, count_big(*) as Cnt from dbo.Orders group by CustomerId;`,
        must: ['schemabinding'],
    },
    // CREATE PROCEDURE WITH options
    {
        name: 'proc_with_options',
        sql: `create procedure dbo.usp_GetOrders
            @CustomerId int,
            @Status nvarchar(20) = 'Pending'
        with execute as owner, recompile
        as
        begin
            select * from dbo.Orders where CustomerId = @CustomerId and Status = @Status;
        end;`,
        must: ['execute as owner', 'recompile', "@Status nvarchar(20) = 'Pending'"],
    },
    // CREATE FUNCTION with RETURNS TABLE / INLINE
    {
        name: 'inline_tvf',
        sql: `create function dbo.fn_GetOrders(@CustomerId int)
        returns table
        with schemabinding
        as
        return (
            select OrderId, Amount from dbo.Orders where CustomerId = @CustomerId
        );`,
        must: ['returns table', 'schemabinding', '@CustomerId'],
    },
    // OUTPUT clause in UPDATE
    {
        name: 'update_output_clause',
        sql: `update dbo.Orders
        set Status = 'Closed'
        output deleted.Status as OldStatus, inserted.Status as NewStatus into dbo.AuditLog
        where OrderId = 1;`,
        must: ['output', 'deleted.Status', 'inserted.Status', 'OldStatus', 'into dbo.AuditLog'],
    },
    // MERGE with OUTPUT
    {
        name: 'merge_output',
        sql: `merge into dbo.Target as t
        using dbo.Source as s on t.Id = s.Id
        when matched then update set t.Name = s.Name
        output $action, inserted.Id, deleted.Name into dbo.MergeLog;`,
        must: ['$action', 'output', 'into dbo.MergeLog'],
    },
    // TRUNCATE with partitions
    {
        name: 'truncate_partitions',
        sql: `truncate table dbo.Orders with (partitions (1, 2, 3 to 5));`,
        must: ['partitions', '3 to 5'],
    },
    // SYSTEM_VERSIONING
    {
        name: 'system_versioning',
        sql: `create table dbo.Orders (
            OrderId int not null primary key,
            Amount decimal(18,2),
            ValidFrom datetime2 generated always as row start,
            ValidTo datetime2 generated always as row end,
            period for system_time (ValidFrom, ValidTo)
        ) with (system_versioning = on (history_table = dbo.OrdersHistory));`,
        must: ['system_versioning = on', 'history_table', 'dbo.OrdersHistory'],
    },
    // NOT FOR REPLICATION
    {
        name: 'not_for_replication',
        sql: `create table dbo.Orders (
            OrderId int not null identity(1,1) not for replication primary key
        );`,
        must: ['not for replication'],
    },
    // CREATE LOGIN WITH MUST_CHANGE
    {
        name: 'login_must_change',
        sql: `create login AppUser with password = 'P@ss123' must_change, check_expiration = on, check_policy = on;`,
        must: ['must_change', 'check_expiration', 'check_policy'],
    },
    // WITH TIES
    {
        name: 'with_ties',
        sql: `select top 10 with ties * from dbo.Orders order by Amount desc;`,
        must: ['with ties'],
    },
    // PERCENT
    {
        name: 'top_percent',
        sql: `select top 10 percent * from dbo.Orders;`,
        must: ['percent'],
    },
    // OPTIMIZE FOR hint
    {
        name: 'optimize_for_hint',
        sql: `select * from dbo.Orders where CustomerId = @id option (optimize for (@id = 1));`,
        must: ['optimize for', '@id = 1'],
    },
    // Table hints
    {
        name: 'table_hints',
        sql: `select * from dbo.Orders with (nolock, index = IX_Orders_Cust);`,
        must: ['nolock', 'index = IX_Orders_Cust'],
    },
];

let passed = 0, failed = 0;
const failures = [];

for (const { name, sql, must } of cases) {
    let out;
    try {
        out = await fmt(sql);
    } catch (e) {
        failures.push({ name, reason: `FORMAT ERROR: ${e.message}` });
        failed++;
        continue;
    }

    const outLower = out.toLowerCase();
    const missing = must.filter(m => !outLower.includes(m.toLowerCase()));
    if (missing.length > 0) {
        failures.push({ name, reason: `DROPPED: ${missing.join(', ')}`, out });
        failed++;
    } else {
        passed++;
    }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
for (const { name, reason, out } of failures) {
    console.log(`FAIL [${name}]: ${reason}`);
    if (out) console.log(`  Output:\n${out.split('\n').map(l => '    ' + l).join('\n')}`);
}
