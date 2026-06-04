/**
 * Probe 37 — DDL deep coverage:
 *   - CREATE TABLE with IDENTITY, ROWGUIDCOL, SPARSE, FILESTREAM
 *   - Computed columns (persisted, not null)
 *   - Period columns (temporal tables)
 *   - SYSTEM_TIME period
 *   - AS OF / BETWEEN FOR SYSTEM_TIME queries
 *   - Table-level constraints: UNIQUE, FOREIGN KEY with ON UPDATE/DELETE
 *   - CHECK constraints with complex expressions
 *   - DEFAULT constraints with getdate() / newid()
 *   - CREATE TABLE ... ON filegroup / TEXTIMAGE_ON
 *   - ALTER TABLE ADD COLUMN with defaults
 *   - ALTER TABLE ALTER COLUMN (type change, nullability)
 *   - ALTER TABLE ADD CONSTRAINT (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK, DEFAULT)
 *   - ALTER TABLE DROP COLUMN
 *   - ALTER TABLE ENABLE/DISABLE CHANGE_TRACKING
 *   - CREATE INDEX ... INCLUDE / WHERE / ON / WITH
 *   - CREATE UNIQUE NONCLUSTERED INDEX
 *   - DROP INDEX IF EXISTS
 *   - CREATE VIEW with CHECK OPTION / SCHEMABINDING / VIEW_METADATA
 *   - CREATE OR ALTER VIEW
 *   - SELECT INTO (permanent and temp table)
 *   - TRUNCATE TABLE (basic)
 *   - Multiple schemas: dbo, sales, hr
 *   - CREATE DATABASE with options
 *   - DROP TABLE IF EXISTS (multiple)
 *   - CREATE TYPE AS TABLE
 *   - CREATE TYPE AS user-defined type
 *   - SEQUENCE: CREATE / ALTER / DROP / NEXT VALUE FOR
 *   - SYNONYMS: CREATE / DROP
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
    // ── CREATE TABLE advanced ─────────────────────────────────────────────────
    check(
        'identity_column',
        `create table dbo.Orders (OrderId int identity(1,1) not null, Amount decimal(18,2) not null)`,
        ['identity', '1,1', 'orderid', 'amount', 'decimal']
    ),
    check(
        'computed_column',
        `create table dbo.Items (Qty int, Price decimal(18,2), Total as (Qty * Price) persisted not null)`,
        ['qty', 'price', 'total', 'as', 'persisted', 'not null']
    ),
    check(
        'rowguidcol',
        `create table dbo.Files (FileId uniqueidentifier rowguidcol not null default newid())`,
        ['uniqueidentifier', 'rowguidcol', 'default', 'newid']
    ),
    check(
        'table_with_filegroup',
        `create table dbo.Logs (LogId int identity not null) on [PRIMARY] textimage_on [PRIMARY]`,
        ['create', 'table', 'logs', 'on', '[primary]', 'textimage_on']
    ),
    check(
        'temporal_table',
        `create table dbo.Orders (OrderId int primary key, Amount decimal(18,2), ValidFrom datetime2 generated always as row start, ValidTo datetime2 generated always as row end, period for system_time (ValidFrom, ValidTo)) with (system_versioning = on (history_table = dbo.OrdersHistory))`,
        ['generated always', 'as row start', 'as row end', 'period for system_time', 'system_versioning', 'on', 'history_table', 'ordershistory']
    ),

    // ── FOR SYSTEM_TIME queries ────────────────────────────────────────────────
    check(
        'for_system_time_as_of',
        `select * from dbo.Orders for system_time as of '2024-01-01'`,
        ['for system_time', 'as of', '2024-01-01']
    ),
    check(
        'for_system_time_between',
        `select * from dbo.Orders for system_time between '2023-01-01' and '2024-01-01'`,
        ['for system_time', 'between', '2023-01-01', '2024-01-01']
    ),

    // ── ALTER TABLE column operations ─────────────────────────────────────────
    check(
        'alter_add_column',
        `alter table dbo.Orders add Email nvarchar(200) null, Phone nvarchar(20) null default 'N/A'`,
        ['add', 'email', 'nvarchar', 'null', 'phone', 'default']
    ),
    check(
        'alter_column_type',
        `alter table dbo.Orders alter column Notes nvarchar(max) null`,
        ['alter column', 'notes', 'nvarchar(max)', 'null']
    ),
    check(
        'alter_drop_column',
        `alter table dbo.Customers drop column LegacyPhone, LegacyFax`,
        ['drop column', 'legacyphone', 'legacyfax']
    ),

    // ── ALTER TABLE constraints ───────────────────────────────────────────────
    check(
        'add_pk_constraint',
        `alter table dbo.Orders add constraint PK_Orders primary key clustered (OrderId asc)`,
        ['add constraint', 'pk_orders', 'primary key', 'clustered', 'orderid', 'asc']
    ),
    check(
        'add_unique_constraint',
        `alter table dbo.Customers add constraint UQ_Customers_Email unique nonclustered (Email asc)`,
        ['add constraint', 'uq_customers_email', 'unique', 'nonclustered', 'email']
    ),
    check(
        'add_fk_cascade',
        `alter table dbo.Orders add constraint FK_Orders_Customers foreign key (CustomerId) references dbo.Customers (CustomerId) on update cascade on delete set null`,
        ['foreign key', 'customerid', 'references', 'on update', 'cascade', 'on delete', 'set null']
    ),
    check(
        'add_check_constraint',
        `alter table dbo.Orders add constraint CK_Orders_Amount check (Amount > 0 and Amount < 1000000)`,
        ['check', 'amount', '> 0', '< 1000000']
    ),
    check(
        'add_default_constraint',
        `alter table dbo.Orders add constraint DF_Orders_Status default 'Pending' for Status`,
        ['default', 'pending', 'for', 'status']
    ),

    // ── Index options ─────────────────────────────────────────────────────────
    check(
        'create_index_include',
        `create nonclustered index IX_Orders_Customer on dbo.Orders (CustomerId asc) include (OrderDate, Amount) where Status = 'Active' with (fillfactor = 80, online = on)`,
        ['create', 'nonclustered', 'include', 'orderdate', 'amount', 'where', 'status', 'active', 'fillfactor', '80', 'online']
    ),
    check(
        'create_unique_index',
        `create unique nonclustered index UQ_Customers_Email on dbo.Customers (Email asc)`,
        ['unique', 'nonclustered', 'uq_customers_email', 'customers', 'email']
    ),
    check(
        'drop_index_if_exists',
        `drop index if exists IX_Orders_Date on dbo.Orders`,
        ['drop', 'index', 'if exists', 'ix_orders_date', 'dbo.orders']
    ),

    // ── View options ──────────────────────────────────────────────────────────
    check(
        'create_view_with_options',
        `create view dbo.ActiveOrders with schemabinding, view_metadata as select OrderId, Amount from dbo.Orders where Status = 'Active' with check option`,
        ['schemabinding', 'view_metadata', 'with check option', 'active']
    ),
    check(
        'create_or_alter_view',
        `create or alter view dbo.OrderSummary as select CustomerId, count(*) as OrderCount from dbo.Orders group by CustomerId`,
        ['create or alter', 'view', 'ordersummary', 'count', 'ordercount', 'group by']
    ),

    // ── DROP TABLE IF EXISTS (multiple) ────────────────────────────────────────
    check(
        'drop_table_if_exists',
        `drop table if exists dbo.TempA, dbo.TempB`,
        ['drop table', 'if exists', 'dbo.tempa', 'dbo.tempb']
    ),

    // ── SEQUENCE ─────────────────────────────────────────────────────────────
    check(
        'create_sequence',
        `create sequence dbo.OrderSeq as bigint start with 1000 increment by 1 minvalue 1000 maxvalue 9999999 cycle cache 100`,
        ['sequence', 'ordersq', 'bigint', 'start with', '1000', 'increment by', 'minvalue', 'maxvalue', 'cycle', 'cache']
    ),
    check(
        'next_value_for',
        `insert into dbo.Orders (OrderId, Amount) values (next value for dbo.OrderSeq, 99.99)`,
        ['next value for', 'dbo.orderseq', 'values', '99.99']
    ),

    // ── TYPE ─────────────────────────────────────────────────────────────────
    check(
        'create_type_table',
        `create type dbo.OrderList as table (OrderId int not null, Amount decimal(18,2) not null)`,
        ['create type', 'dbo.orderlist', 'as table', 'orderid', 'amount', 'decimal']
    ),
    check(
        'create_type_uddt',
        `create type dbo.PhoneNumber from nvarchar(20) not null`,
        ['create type', 'phonenumber', 'from', 'nvarchar', 'not null']
    ),

    // ── MERGE ─────────────────────────────────────────────────────────────────
    check(
        'merge_basic',
        `merge dbo.Customers as target using (select * from @NewCustomers) as source on target.CustomerId = source.CustomerId when matched then update set target.Name = source.Name when not matched by target then insert (CustomerId, Name) values (source.CustomerId, source.Name) when not matched by source then delete;`,
        ['merge', 'target', 'source', 'when matched', 'update set', 'when not matched', 'insert', 'values', 'delete']
    ),

    // ── TRUNCATE TABLE (basic) ────────────────────────────────────────────────
    check(
        'truncate_basic',
        `truncate table dbo.Logs`,
        ['truncate', 'table', 'dbo.logs']
    ),

    // ── CREATE SYNONYM ────────────────────────────────────────────────────────
    check(
        'create_synonym',
        `create synonym dbo.OrdersAlias for dbo.Orders`,
        ['create synonym', 'ordersalias', 'for', 'dbo.orders']
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

console.log(`\nProbe 37 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
