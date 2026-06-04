/**
 * Probe 26 — ALTER TABLE ADD/DROP constraints, ALTER VIEW, ALTER PROC,
 *             CREATE/ALTER FUNCTION (inline, multi-statement, scalar),
 *             column-level COLLATE, computed column in ALTER TABLE,
 *             CREATE TABLE with ROWGUIDCOL, SPARSE, MASKED WITH,
 *             temporal tables, memory-optimized tables, CLR-related
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');

async function fmt(sql) {
    try {
        return await prettier.format(sql, {
            parser: 'tsql',
            plugins: [pluginPath],
            printWidth: 120,
        });
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function check(label, input, mustContain) {
    return { label, input, mustContain };
}

const cases = [
    // ── ALTER TABLE ADD constraint ────────────────────────────────────────────
    check(
        'alter_table_add_fk',
        `alter table dbo.Orders add constraint FK_Orders_Customer foreign key (CustomerId) references dbo.Customers (Id) on delete cascade`,
        ['alter', 'table', 'add', 'constraint', 'fk_orders_customer', 'foreign', 'key', 'customerid', 'references', 'dbo.customers', 'on delete cascade']
    ),
    check(
        'alter_table_add_check',
        `alter table dbo.Orders add constraint CHK_Status check (Status in ('New', 'Processing', 'Shipped'))`,
        ['add', 'constraint', 'chk_status', 'check', 'status', 'in', 'new', 'processing', 'shipped']
    ),
    check(
        'alter_table_add_default',
        `alter table dbo.Orders add constraint DF_Status default 'New' for Status`,
        ['add', 'constraint', 'df_status', 'default', 'new', 'for', 'status']
    ),
    check(
        'alter_table_drop_constraint',
        `alter table dbo.Orders drop constraint FK_Orders_Customer`,
        ['alter', 'table', 'drop', 'constraint', 'fk_orders_customer']
    ),
    check(
        'alter_table_add_column',
        `alter table dbo.Orders add Notes nvarchar(max) null, Priority int not null default 0`,
        ['alter', 'table', 'add', 'notes', 'nvarchar', 'max', 'priority', 'int', 'not null', 'default', '0']
    ),
    check(
        'alter_table_drop_column',
        `alter table dbo.Orders drop column Notes`,
        ['alter', 'table', 'drop', 'column', 'notes']
    ),
    check(
        'alter_table_alter_column',
        `alter table dbo.Orders alter column Notes nvarchar(500) null`,
        ['alter', 'table', 'alter', 'column', 'notes', 'nvarchar', '500', 'null']
    ),

    // ── ALTER TABLE WITH NOCHECK ──────────────────────────────────────────────
    check(
        'alter_table_nocheck',
        `alter table dbo.Orders with nocheck add constraint CHK_Amount check (Amount > 0)`,
        ['with', 'nocheck', 'add', 'constraint', 'chk_amount', 'check', 'amount']
    ),

    // ── CREATE FUNCTION — scalar ──────────────────────────────────────────────
    check(
        'create_function_scalar',
        `create function dbo.GetDiscount(@Amount decimal(10,2)) returns decimal(10,2) as begin return case when @Amount > 1000 then 0.1 else 0.05 end end`,
        ['create', 'function', 'dbo.getdiscount', 'returns', 'decimal', 'return', 'case', 'when', '@amount']
    ),

    // ── CREATE FUNCTION — inline TVF ─────────────────────────────────────────
    check(
        'create_function_inline_tvf',
        `create function dbo.GetActiveOrders(@CustomerId int) returns table as return (select OrderId, OrderDate from dbo.Orders where CustomerId = @CustomerId and Status = 'Active')`,
        ['create', 'function', 'dbo.getactiveorders', 'returns', 'table', 'as', 'return', 'orderid', 'orderdate', 'active']
    ),

    // ── ALTER FUNCTION ────────────────────────────────────────────────────────
    check(
        'alter_function',
        `alter function dbo.GetDiscount(@Amount decimal(10,2)) returns decimal(10,2) as begin return case when @Amount > 2000 then 0.15 else 0.05 end end`,
        ['alter', 'function', 'dbo.getdiscount', 'returns', 'decimal', 'return', '0.15']
    ),

    // ── ALTER VIEW ────────────────────────────────────────────────────────────
    check(
        'alter_view',
        `alter view dbo.ActiveOrders as select OrderId, CustomerId, OrderDate from dbo.Orders where Status = 'Active'`,
        ['alter', 'view', 'dbo.activeorders', 'as', 'select', 'orderid', 'customerid', 'orderdate', 'active']
    ),

    // ── ALTER PROCEDURE ───────────────────────────────────────────────────────
    check(
        'alter_procedure',
        `alter procedure dbo.GetOrder @OrderId int as select * from dbo.Orders where OrderId = @OrderId`,
        ['alter', 'procedure', 'dbo.getorder', '@orderid', 'int', 'as', 'select', 'orderid']
    ),

    // ── SPARSE column ────────────────────────────────────────────────────────
    check(
        'sparse_column',
        `create table dbo.FlexData (Id int not null primary key, Attr1 nvarchar(100) sparse null, Attr2 int sparse null)`,
        ['sparse', 'attr1', 'attr2']
    ),

    // ── MASKED WITH (dynamic data masking) ───────────────────────────────────
    check(
        'masked_with_function',
        `create table dbo.Customers (Id int not null primary key, Email nvarchar(200) masked with (function = 'email()') not null, Phone nvarchar(20) masked with (function = 'default()') null)`,
        ['masked', 'with', 'function', 'email()', 'default()']
    ),

    // ── Temporal table (system-time) ─────────────────────────────────────────
    check(
        'temporal_table',
        `create table dbo.Orders (OrderId int not null primary key, CustomerId int not null, SysStart datetime2 generated always as row start not null, SysEnd datetime2 generated always as row end not null, period for system_time (SysStart, SysEnd)) with (system_versioning = on (history_table = dbo.OrdersHistory))`,
        ['generated', 'always', 'as', 'row', 'start', 'period', 'for', 'system_time', 'system_versioning', 'history_table', 'dbo.ordershistory']
    ),

    // ── AS OF query (temporal) ────────────────────────────────────────────────
    check(
        'temporal_as_of',
        `select * from dbo.Orders for system_time as of '2024-01-01'`,
        ['for', 'system_time', 'as', 'of', '2024-01-01']
    ),
    check(
        'temporal_between',
        `select * from dbo.Orders for system_time between '2024-01-01' and '2024-12-31'`,
        ['for', 'system_time', 'between', '2024-01-01', '2024-12-31']
    ),
    check(
        'temporal_from_to',
        `select * from dbo.Orders for system_time from '2024-01-01' to '2024-12-31'`,
        ['for', 'system_time', 'from', '2024-01-01', 'to', '2024-12-31']
    ),
    check(
        'temporal_all',
        `select * from dbo.Orders for system_time all`,
        ['for', 'system_time', 'all']
    ),

    // ── ROWGUIDCOL ────────────────────────────────────────────────────────────
    check(
        'rowguidcol',
        `create table dbo.Files (Id uniqueidentifier not null rowguidcol default newid(), Name nvarchar(200) not null)`,
        ['rowguidcol', 'default', 'newid']
    ),

    // ── IDENTITY with reseed ──────────────────────────────────────────────────
    check(
        'dbcc_checkident',
        `dbcc checkident (dbo.Orders, reseed, 1000)`,
        ['dbcc', 'checkident', 'dbo.orders', 'reseed', '1000']
    ),

    // ── sp_rename ────────────────────────────────────────────────────────────
    check(
        'sp_rename_table',
        `exec sp_rename 'dbo.OldOrders', 'Orders'`,
        ['sp_rename', 'dbo.oldorders', 'orders']
    ),
    check(
        'sp_rename_column',
        `exec sp_rename 'dbo.Orders.OldStatus', 'Status', 'COLUMN'`,
        ['sp_rename', 'dbo.orders.oldstatus', 'status', 'column']
    ),

    // ── EXEC with string expression ────────────────────────────────────────────
    check(
        'exec_dynamic_sql',
        `declare @sql nvarchar(max); set @sql = 'select * from dbo.Orders'; exec (@sql)`,
        ['@sql', 'select * from dbo.orders', 'exec', '@sql']
    ),

    // ── sp_executesql ─────────────────────────────────────────────────────────
    check(
        'sp_executesql',
        `exec sp_executesql N'select * from dbo.Orders where CustomerId = @Id', N'@Id int', @Id = 1`,
        ['sp_executesql', 'select * from dbo.orders', '@id', 'int']
    ),

    // ── DROP with IF EXISTS ────────────────────────────────────────────────────
    check(
        'drop_view_if_exists',
        `drop view if exists dbo.ActiveOrders`,
        ['drop', 'view', 'if', 'exists', 'dbo.activeorders']
    ),
    check(
        'drop_proc_if_exists',
        `drop procedure if exists dbo.GetOrder`,
        ['drop', 'procedure', 'if', 'exists', 'dbo.getorder']
    ),
    check(
        'drop_function_if_exists',
        `drop function if exists dbo.GetDiscount`,
        ['drop', 'function', 'if', 'exists', 'dbo.getdiscount']
    ),

    // ── GRANT with GRANT OPTION ────────────────────────────────────────────────
    check(
        'grant_with_grant_option',
        `grant select on dbo.Orders to [WebUser] with grant option`,
        ['grant', 'select', 'on', 'dbo.orders', 'to', 'webuser', 'with', 'grant', 'option']
    ),
    check(
        'revoke_cascade',
        `revoke select on dbo.Orders from [WebUser] cascade`,
        ['revoke', 'select', 'on', 'dbo.orders', 'from', 'webuser', 'cascade']
    ),

    // ── DENY ──────────────────────────────────────────────────────────────────
    check(
        'deny',
        `deny delete on dbo.Orders to [ReadOnly]`,
        ['deny', 'delete', 'on', 'dbo.orders', 'to', 'readonly']
    ),

    // ── CREATE/DROP INDEX ─────────────────────────────────────────────────────
    check(
        'create_index_with_include',
        `create index IX_Orders_Date on dbo.Orders (OrderDate desc) include (CustomerId, Amount) where Status = 'Active'`,
        ['create', 'index', 'ix_orders_date', 'on', 'dbo.orders', 'orderdate', 'desc', 'include', 'customerid', 'amount', 'where', 'active']
    ),
    check(
        'create_unique_clustered_index',
        `create unique clustered index IX_Orders_PK on dbo.Orders (OrderId)`,
        ['create', 'unique', 'clustered', 'index', 'ix_orders_pk', 'orderid']
    ),
    check(
        'drop_index',
        `drop index IX_Orders_Date on dbo.Orders`,
        ['drop', 'index', 'ix_orders_date', 'on', 'dbo.orders']
    ),
];

let pass = 0;
let fail = 0;
const failures = [];

for (const { label, input, mustContain } of cases) {
    const out = await fmt(input);
    const outNorm = normalize(out);
    const missing = mustContain.filter(kw => !outNorm.includes(kw.toLowerCase()));
    if (missing.length === 0) {
        pass++;
    } else {
        fail++;
        failures.push({ label, input, out: out.trim(), missing });
    }
}

console.log(`\nProbe 26 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 300)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
