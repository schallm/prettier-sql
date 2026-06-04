/**
 * Probe 47 — DDL: column constraints, computed columns, sequences, synonyms,
 *   CHECK constraints, DEFAULT constraints, edge-case ALTER TABLE forms,
 *   CREATE TYPE, table-valued parameters, CREATE RULE, CREATE DEFAULT (legacy),
 *   various index options, CREATE STATISTICS, UPDATE STATISTICS,
 *   column-level COLLATE, FILESTREAM column, SPARSE column,
 *   ROWGUIDCOL, TIMESTAMP/ROWVERSION,
 *   ALTER TABLE ADD constraint forms,
 *   ALTER TABLE DROP COLUMN / DROP CONSTRAINT,
 *   ALTER TABLE WITH NOCHECK ADD CONSTRAINT,
 *   CREATE UNIQUE CLUSTERED INDEX with INCLUDE,
 *   CREATE NONCLUSTERED INDEX with FILTER
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
    // ── Computed columns ─────────────────────────────────────────────────────
    check(
        'computed_column_simple',
        `create table dbo.Orders (OrderId int primary key, Qty int not null, UnitPrice decimal(10,2) not null, Total as Qty * UnitPrice)`,
        ['create table', 'orderid', 'qty', 'unitprice', 'total', 'as qty * unitprice']
    ),
    check(
        'computed_column_persisted',
        `create table dbo.Rect (W float not null, H float not null, Area as W * H persisted)`,
        ['create table', 'area', 'as w * h', 'persisted']
    ),

    // ── SPARSE / ROWGUIDCOL / FILESTREAM ─────────────────────────────────────
    check(
        'sparse_column',
        `create table dbo.Profile (Id int primary key, ExtraData nvarchar(max) sparse null)`,
        ['sparse', 'null']
    ),
    check(
        'rowguidcol',
        `create table dbo.Entity (Id uniqueidentifier default newsequentialid() rowguidcol not null primary key)`,
        ['rowguidcol', 'uniqueidentifier', 'newsequentialid']
    ),

    // ── ROWVERSION / TIMESTAMP ────────────────────────────────────────────────
    check(
        'rowversion_col',
        `create table dbo.Orders (OrderId int primary key, RowVer rowversion not null)`,
        ['rowversion', 'rowver']
    ),

    // ── COLLATE ───────────────────────────────────────────────────────────────
    check(
        'column_collate',
        `create table dbo.Names (Id int primary key, Name nvarchar(200) collate SQL_Latin1_General_CP1_CI_AS not null)`,
        ['collate', 'sql_latin1_general_cp1_ci_as']
    ),

    // ── CREATE SEQUENCE ───────────────────────────────────────────────────────
    check(
        'create_sequence',
        `create sequence dbo.OrderSeq as bigint start with 1000 increment by 1 minvalue 1000 maxvalue 9999999999 no cycle cache 50`,
        ['create sequence', 'orderseq', 'start with 1000', 'increment by 1', 'minvalue', 'maxvalue', 'no cycle', 'cache 50']
    ),
    check(
        'alter_sequence',
        `alter sequence dbo.OrderSeq restart with 5000`,
        ['alter sequence', 'orderseq', 'restart with 5000']
    ),
    check(
        'drop_sequence',
        `drop sequence dbo.OrderSeq`,
        ['drop sequence', 'orderseq']
    ),

    // ── SYNONYM ───────────────────────────────────────────────────────────────
    check(
        'create_synonym',
        `create synonym dbo.Ord for LinkedServer.RemoteDb.dbo.Orders`,
        ['create synonym', 'ord', 'linkedserver.remotedb.dbo.orders']
    ),
    check(
        'drop_synonym',
        `drop synonym dbo.Ord`,
        ['drop synonym', 'ord']
    ),

    // ── CREATE TYPE ───────────────────────────────────────────────────────────
    check(
        'create_type_table',
        `create type dbo.OrderList as table (OrderId int not null, Amount decimal(18,2) not null, Status nvarchar(20) not null)`,
        ['create type', 'orderlist', 'as table', 'orderid', 'amount', 'status']
    ),
    check(
        'create_type_alias',
        `create type dbo.Money50 from decimal(18, 2) not null`,
        ['create type', 'money50', 'from decimal', '18', '2', 'not null']
    ),
    check(
        'drop_type',
        `drop type dbo.OrderList`,
        ['drop type', 'orderlist']
    ),

    // ── ALTER TABLE ADD CONSTRAINT ────────────────────────────────────────────
    check(
        'alter_table_add_pk',
        `alter table dbo.Orders add constraint PK_Orders primary key clustered (OrderId asc)`,
        ['alter table', 'add constraint', 'pk_orders', 'primary key clustered', 'orderid']
    ),
    check(
        'alter_table_add_fk',
        `alter table dbo.Orders add constraint FK_Orders_Customers foreign key (CustomerId) references dbo.Customers (Id) on delete cascade on update set null`,
        ['add constraint', 'fk_orders_customers', 'foreign key', 'customerid', 'references', 'dbo.customers', 'on delete cascade', 'on update set null']
    ),
    check(
        'alter_table_add_check',
        `alter table dbo.Orders add constraint CHK_Orders_Amount check (Amount > 0)`,
        ['add constraint', 'chk_orders_amount', 'check', 'amount > 0']
    ),
    check(
        'alter_table_add_default',
        `alter table dbo.Orders add constraint DF_Orders_Status default 'Pending' for Status`,
        ['add constraint', 'df_orders_status', 'default', "'pending'", 'for status']
    ),
    check(
        'alter_table_with_nocheck',
        `alter table dbo.Orders with nocheck add constraint CHK_Amount check (Amount >= 0)`,
        ['alter table', 'with nocheck', 'add constraint', 'chk_amount', 'check', 'amount >= 0']
    ),

    // ── ALTER TABLE DROP ──────────────────────────────────────────────────────
    check(
        'alter_table_drop_column',
        `alter table dbo.Orders drop column LegacyField`,
        ['alter table', 'drop column', 'legacyfield']
    ),
    check(
        'alter_table_drop_constraint',
        `alter table dbo.Orders drop constraint FK_Orders_Customers`,
        ['alter table', 'drop constraint', 'fk_orders_customers']
    ),

    // ── CREATE INDEX with INCLUDE / FILTER ───────────────────────────────────
    check(
        'create_filtered_index',
        `create nonclustered index IX_Orders_Active on dbo.Orders (OrderDate desc, CustomerId) include (Amount, Status) where Status = 'Active'`,
        ['create nonclustered index', 'ix_orders_active', 'orderdate', 'customerid', 'include', 'amount', 'status', 'where status']
    ),

    // ── CREATE STATISTICS / UPDATE STATISTICS ─────────────────────────────────
    check(
        'create_statistics',
        `create statistics STAT_Orders_Date on dbo.Orders (OrderDate, CustomerId) with fullscan`,
        ['create statistics', 'stat_orders_date', 'orderdate', 'customerid', 'fullscan']
    ),
    check(
        'update_statistics',
        `update statistics dbo.Orders with fullscan, all`,
        ['update statistics', 'dbo.orders', 'fullscan', 'all']
    ),

    // ── NEXT VALUE FOR (sequence) ─────────────────────────────────────────────
    check(
        'next_value_for',
        `insert into dbo.Orders (OrderId, Amount) values (next value for dbo.OrderSeq, 100)`,
        ['next value for', 'dbo.orderseq', '100']
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

console.log(`\nProbe 47 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
