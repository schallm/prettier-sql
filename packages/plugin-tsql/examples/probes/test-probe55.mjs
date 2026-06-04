/**
 * Probe 55 — Data types coverage, complex table definitions,
 *   type conversions, and lesser-tested statement forms:
 *   - All common SQL Server data types in table definition
 *   - GEOGRAPHY / GEOMETRY spatial types
 *   - HIERARCHYID column
 *   - XML column with schema collection
 *   - VARBINARY(MAX) / IMAGE (legacy)
 *   - NTEXT / TEXT (legacy)
 *   - MONEY / SMALLMONEY
 *   - TINYINT / SMALLINT
 *   - REAL / FLOAT
 *   - DATETIME / SMALLDATETIME
 *   - DATE / TIME / DATETIME2 / DATETIMEOFFSET
 *   - BIT column with DEFAULT 0
 *   - UNIQUEIDENTIFIER with NEWID() default
 *   - VARCHAR(MAX) with DEFAULT ''
 *   - Identity column with SEED and INCREMENT
 *   - Composite PK inline
 *   - FK with named columns referencing multi-column PK
 *   - CHECK constraint inline in column def
 *   - UNIQUE constraint on single column (inline)
 *   - DROP TABLE multiple tables
 *   - SELECT with subquery in column list AND WHERE
 *   - INSERT with DEFAULT VALUES
 *   - UPDATE with subquery in SET
 *   - DELETE with alias
 *   - TOP WITH TIES
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
    // ── All common data types ─────────────────────────────────────────────────
    check(
        'all_numeric_types',
        `create table dbo.TypeTest (Col1 tinyint, Col2 smallint, Col3 int, Col4 bigint, Col5 decimal(18,4), Col6 numeric(10,2), Col7 real, Col8 float, Col9 money, Col10 smallmoney, Col11 bit)`,
        ['tinyint', 'smallint', 'int', 'bigint', 'decimal', 'numeric', 'real', 'float', 'money', 'smallmoney', 'bit']
    ),
    check(
        'all_date_types',
        `create table dbo.DateTest (Col1 date, Col2 time(7), Col3 datetime, Col4 datetime2(7), Col5 datetimeoffset(7), Col6 smalldatetime)`,
        ['date', 'time', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime']
    ),
    check(
        'all_string_types',
        `create table dbo.StringTest (Col1 char(10), Col2 varchar(100), Col3 varchar(max), Col4 nchar(10), Col5 nvarchar(200), Col6 nvarchar(max), Col7 text, Col8 ntext)`,
        ['char(10)', 'varchar(100)', 'varchar(max)', 'nchar(10)', 'nvarchar(200)', 'nvarchar(max)', 'text', 'ntext']
    ),
    check(
        'binary_types',
        `create table dbo.BinTest (Col1 binary(16), Col2 varbinary(256), Col3 varbinary(max), Col4 image, Col5 uniqueidentifier)`,
        ['binary(16)', 'varbinary(256)', 'varbinary(max)', 'image', 'uniqueidentifier']
    ),

    // ── Spatial / XML / HIERARCHYID ───────────────────────────────────────────
    check(
        'spatial_column',
        `create table dbo.Locations (Id int primary key, Name nvarchar(200), GeoPoint geography, BBox geometry)`,
        ['geography', 'geometry', 'geopoint', 'bbox']
    ),
    check(
        'xml_column',
        `create table dbo.Config (Id int primary key, Settings xml, TypedSettings xml(dbo.ConfigSchema))`,
        ['xml', 'settings', 'typedsettings', 'dbo.configschema']
    ),
    check(
        'hierarchyid_column',
        `create table dbo.OrgChart (Id hierarchyid primary key, Name nvarchar(200), Level as Id.GetLevel() persisted)`,
        ['hierarchyid', 'getlevel', 'persisted']
    ),

    // ── Identity with seed/increment ──────────────────────────────────────────
    check(
        'identity_seed_increment',
        `create table dbo.Orders (OrderId int identity(1000, 5) primary key not null, Amount decimal(18,2))`,
        ['identity', '1000', '5', 'primary key']
    ),

    // ── Composite PK + FK ──────────────────────────────────────────────────────
    check(
        'composite_pk',
        `create table dbo.OrderLines (OrderId int not null, LineNum int not null, ProductId int not null, primary key (OrderId, LineNum), foreign key (ProductId) references dbo.Products (Id))`,
        ['primary key', 'orderid', 'linenum', 'foreign key', 'productid', 'references', 'dbo.products']
    ),

    // ── Inline CHECK / UNIQUE ─────────────────────────────────────────────────
    check(
        'inline_check_unique',
        `create table dbo.Products (Id int primary key, Code nvarchar(20) unique not null, Price decimal(10,2) check (Price > 0) not null, Stock int default 0 check (Stock >= 0))`,
        ['unique', 'check (price > 0)', 'default 0', 'check (stock >= 0)']
    ),

    // ── DROP TABLE multiple ────────────────────────────────────────────────────
    check(
        'drop_table_multiple',
        `drop table if exists dbo.Temp1, dbo.Temp2, dbo.Temp3`,
        ['drop table', 'if exists', 'dbo.temp1', 'dbo.temp2', 'dbo.temp3']
    ),

    // ── INSERT DEFAULT VALUES ──────────────────────────────────────────────────
    check(
        'insert_default_values',
        `insert into dbo.Events default values`,
        ['insert into', 'dbo.events', 'default values']
    ),

    // ── UPDATE with subquery in SET ────────────────────────────────────────────
    check(
        'update_subquery_set',
        `update dbo.Customers set TotalOrders = (select count(*) from dbo.Orders where CustomerId = dbo.Customers.Id), LastOrderDate = (select max(OrderDate) from dbo.Orders where CustomerId = dbo.Customers.Id)`,
        ['update', 'set totalorders', '= (select count', 'set lastorderdate', 'lastorderdate = (select max']
    ),

    // ── TOP WITH TIES ─────────────────────────────────────────────────────────
    check(
        'top_with_ties',
        `select top 5 with ties OrderId, Amount from dbo.Orders order by Amount desc`,
        ['top 5', 'with ties', 'order by amount desc']
    ),

    // ── DELETE with alias ─────────────────────────────────────────────────────
    check(
        'delete_with_alias',
        `delete o from dbo.Orders o inner join dbo.Customers c on o.CustomerId = c.Id where c.IsDeleted = 1`,
        ['delete o', 'from dbo.orders o', 'inner join', 'isdeleted = 1']
    ),

    // ── Subquery in both SELECT and WHERE ─────────────────────────────────────
    check(
        'subquery_select_and_where',
        `select OrderId, Amount, (select Name from dbo.Customers where Id = o.CustomerId) as CustomerName from dbo.Orders o where Amount > (select avg(Amount) from dbo.Orders)`,
        ['select name', 'customername', 'where amount >', 'select avg']
    ),

    // ── UNIQUEIDENTIFIER default ───────────────────────────────────────────────
    check(
        'guid_default',
        `create table dbo.Entity (Id uniqueidentifier not null default newid(), Name nvarchar(200) not null)`,
        ['uniqueidentifier', 'default newid']
    ),

    // ── Money types ───────────────────────────────────────────────────────────
    check(
        'money_columns',
        `create table dbo.Invoice (Id int primary key, Amount money not null, Tax smallmoney not null default 0)`,
        ['money', 'smallmoney', 'default 0']
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

console.log(`\nProbe 55 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
