/**
 * Semantic-safety probe — anything that MUST survive formatting.
 * Run from packages/plugin-tsql/
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = join(__dirname, 'dist/index.js');
const fmt = sql =>
    prettier.format(sql, { parser: 'tsql', plugins: [plugin], printWidth: 80 }).then(r => r.trim());

async function check(name, sql, must) {
    let out;
    try { out = await fmt(sql); }
    catch (e) { console.log(`FAIL [${name}] FORMAT ERROR: ${e.message}`); return false; }
    const outLower = out.toLowerCase();
    // normalise whitespace for matching
    const norm = s => s.replace(/\s+/g, ' ').toLowerCase();
    const normOut = norm(out);
    const missing = must.filter(m => !normOut.includes(norm(m)));
    if (missing.length) {
        console.log(`FAIL [${name}] DROPPED: ${missing.join(' | ')}`);
        console.log(out.split('\n').map(l => '  ' + l).join('\n'));
        return false;
    }
    return true;
}

let ok = 0, fail = 0;
async function t(name, sql, must) { (await check(name, sql, must)) ? ok++ : fail++; }

// ── FK: NOT FOR REPLICATION on constraint ──────────────────────────────────
await t('fk_not_for_replication',
    `create table dbo.T (
        Id int primary key,
        ParentId int,
        constraint FK_Parent foreign key (ParentId)
            references dbo.Parent (Id)
            not for replication
     );`,
    ['not for replication', 'FK_Parent']);

// ── CHECK: NOT FOR REPLICATION ────────────────────────────────────────────
await t('check_not_for_replication',
    `create table dbo.T (
        Id int primary key,
        Age int,
        constraint CK_Age check not for replication (Age between 0 and 120)
     );`,
    ['not for replication', 'CK_Age', '0 and 120']);

// ── ALTER TABLE: column-level CHECK constraint ─────────────────────────────
await t('alter_table_add_check',
    `alter table dbo.Orders add
        constraint CK_Amount check (Amount > 0);`,
    ['check', 'Amount > 0', 'CK_Amount']);

// ── ALTER TABLE: add FK ────────────────────────────────────────────────────
await t('alter_table_add_fk',
    `alter table dbo.OrderLines add
        constraint FK_Lines foreign key (OrderId)
            references dbo.Orders (OrderId)
            on delete cascade;`,
    ['foreign key', 'references', 'on delete cascade', 'FK_Lines']);

// ── ALTER TABLE: drop constraint ──────────────────────────────────────────
await t('alter_table_drop_constraint',
    `alter table dbo.Orders drop constraint CK_Amount, constraint FK_Customer;`,
    ['CK_Amount', 'FK_Customer']);

// ── ALTER TABLE: alter column ─────────────────────────────────────────────
await t('alter_table_alter_column',
    `alter table dbo.Orders alter column Status nvarchar(50) not null;`,
    ['alter column', 'Status', 'nvarchar(50)', 'not null']);

// ── JOIN hints ────────────────────────────────────────────────────────────
await t('join_hint_loop',
    `select o.Id, c.Name
     from dbo.Orders o inner loop join dbo.Customers c on o.CustId = c.Id;`,
    ['loop join', 'inner']);

await t('join_hint_hash',
    `select o.Id, c.Name
     from dbo.Orders o inner hash join dbo.Customers c on o.CustId = c.Id;`,
    ['hash join']);

await t('join_hint_merge',
    `select o.Id, c.Name
     from dbo.Orders o inner merge join dbo.Customers c on o.CustId = c.Id;`,
    ['merge join']);

// ── Table hint: READPAST, UPDLOCK, HOLDLOCK ───────────────────────────────
await t('table_hint_updlock',
    `select * from dbo.Orders with (updlock, serializable) where Status = 'Pending';`,
    ['updlock', 'serializable']);

// ── FORCESEEK / FORCESCAN ────────────────────────────────────────────────
await t('forceseek_hint',
    `select * from dbo.Orders with (forceseek) where CustomerId = 1;`,
    ['forceseek']);

await t('forceseek_with_index',
    `select * from dbo.Orders with (forceseek(IX_Orders_Cust (CustomerId))) where CustomerId = 1;`,
    ['forceseek', 'IX_Orders_Cust', 'CustomerId']);

// ── CREATE INDEX: included columns order-sensitivity ─────────────────────
await t('index_column_order',
    `create index IX_Test on dbo.T (A asc, B desc, C asc);`,
    ['A asc', 'B desc', 'C asc']);

// ── PRIMARY KEY: clustered/nonclustered ───────────────────────────────────
await t('pk_nonclustered',
    `create table dbo.T (
        Id int not null,
        TenantId int not null,
        constraint PK_T primary key nonclustered (Id, TenantId)
     );`,
    ['nonclustered', 'PK_T']);

// ── UNIQUE INDEX: nonclustered ────────────────────────────────────────────
await t('unique_nonclustered',
    `create table dbo.T (
        Id int primary key,
        Code nvarchar(50) not null,
        constraint UQ_Code unique nonclustered (Code)
     );`,
    ['nonclustered', 'UQ_Code']);

// ── CREATE TABLE: ON filegroup ────────────────────────────────────────────
await t('create_table_filegroup',
    `create table dbo.Orders (Id int primary key) on [PRIMARY];`,
    ['on', 'PRIMARY']);

// ── CREATE CLUSTERED INDEX on filegroup ───────────────────────────────────
await t('index_on_filegroup',
    `create clustered index IX_CL on dbo.Orders (OrderDate) on [ARCHIVE];`,
    ['clustered', 'ARCHIVE']);

// ── WITH NOCHECK on FK ────────────────────────────────────────────────────
await t('alter_table_nocheck',
    `alter table dbo.Orders with nocheck add
        constraint FK_Cust foreign key (CustId) references dbo.Customers (Id);`,
    ['with nocheck', 'foreign key', 'FK_Cust']);

// ── DISABLE / ENABLE constraint ───────────────────────────────────────────
await t('alter_table_nocheck_constraint',
    `alter table dbo.Orders nocheck constraint FK_Cust;`,
    ['nocheck constraint', 'FK_Cust']);

await t('alter_table_check_constraint',
    `alter table dbo.Orders check constraint all;`,
    ['check constraint all']);

// ── CREATE TABLE: PERIOD FOR SYSTEM_TIME ──────────────────────────────────
await t('temporal_period',
    `create table dbo.T (
        Id int primary key,
        SysStart datetime2 generated always as row start not null,
        SysEnd   datetime2 generated always as row end   not null,
        period for system_time (SysStart, SysEnd)
     ) with (system_versioning = on);`,
    ['period for system_time', 'SysStart', 'SysEnd', 'system_versioning = on']);

// ── DECLARE with initial value ────────────────────────────────────────────
await t('declare_with_value',
    `declare @x int = 42, @s nvarchar(100) = N'hello';`,
    ['@x int', '= 42', "@s nvarchar(100)", "= N'hello'"]);

// ── CASE inside WHERE ─────────────────────────────────────────────────────
await t('case_in_where',
    `select * from dbo.T where case when @x = 1 then A else B end = 'Y';`,
    ['case when', 'then A', 'else B', "= 'Y'"]);

// ── OVER clause: ROWS BETWEEN ─────────────────────────────────────────────
await t('over_rows_between',
    `select sum(Amount) over (order by OrderDate rows between 2 preceding and current row) from dbo.Orders;`,
    ['rows between', '2 preceding', 'current row']);

// ── EXCEPT / INTERSECT priority ───────────────────────────────────────────
await t('except_preserves_all',
    `select Id from dbo.A
     except
     select Id from dbo.B;`,
    ['except', 'dbo.A', 'dbo.B']);

// ── IIF function ─────────────────────────────────────────────────────────
await t('iif_function',
    `select iif(Amount > 100, 'Large', 'Small') from dbo.Orders;`,
    ['iif', 'Amount > 100', "'Large'", "'Small'"]);

// ── CHOOSE function ───────────────────────────────────────────────────────
await t('choose_function',
    `select choose(DayOfWeek, 'Mon','Tue','Wed','Thu','Fri') from dbo.T;`,
    ['choose', 'DayOfWeek', "'Mon'", "'Fri'"]);

// ── FORMAT function ───────────────────────────────────────────────────────
await t('format_function',
    `select format(Amount, 'C2', 'en-US') from dbo.Orders;`,
    ['format', "'C2'", "'en-US'"]);

console.log(`\n${ok} passed, ${fail} failed`);
