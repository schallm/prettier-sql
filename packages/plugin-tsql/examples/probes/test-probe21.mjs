/**
 * Twenty-first probe — ROWVERSION/TIMESTAMP, IDENTITY_INSERT, ALTER TABLE
 * ADD COLUMN variations, CREATE TYPE (user-defined table type), FILESTREAM,
 * sparse columns, CREATE SCHEMA, ALTER SCHEMA TRANSFER, database scoped
 * config, temporal tables, system-versioned queries.
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = join(__dirname, 'dist/index.js');
const fmt = sql =>
    prettier.format(sql, { parser: 'tsql', plugins: [plugin], printWidth: 80 }).then(r => r.trim());
const norm = s => s.replace(/\s+/g, ' ').toLowerCase();

let ok = 0, fail = 0;
async function t(name, sql, must) {
    let out;
    try { out = await fmt(sql); }
    catch (e) { console.log(`FAIL [${name}] ERROR: ${e.message}`); fail++; return; }
    const no = norm(out);
    const missing = must.filter(m => !no.includes(norm(m)));
    if (missing.length) {
        console.log(`FAIL [${name}] DROPPED: ${missing.join(' | ')}`);
        console.log(out.split('\n').map(l => '  ' + l).join('\n'));
        fail++;
    } else ok++;
}

// ── ROWVERSION / TIMESTAMP column ─────────────────────────────────────────
await t('create_table_rowversion',
    `create table dbo.T (
         Id int not null primary key,
         RowVer rowversion not null
     );`,
    ['rowversion']);

await t('create_table_timestamp',
    `create table dbo.T (
         Id int not null primary key,
         TS timestamp not null
     );`,
    ['timestamp']);

// ── IDENTITY column options ────────────────────────────────────────────────
await t('identity_column',
    `create table dbo.T (
         Id bigint not null identity(1000, 5) primary key
     );`,
    ['identity(1000, 5)']);

// ── ROWGUIDCOL without default ────────────────────────────────────────────
await t('rowguidcol_no_default',
    `create table dbo.T (
         Id int not null,
         RowGuid uniqueidentifier not null rowguidcol
     );`,
    ['rowguidcol']);

// ── MASKED column ─────────────────────────────────────────────────────────
await t('masked_column',
    `create table dbo.T (
         Id int not null,
         Phone nvarchar(20) masked with (function = 'partial(0,"XXX-XXX-",4)')
     );`,
    ["masked with (function = 'partial(0"]);

// ── CREATE TYPE as table with constraints ─────────────────────────────────
await t('create_type_table',
    `create type dbo.CustomerList as table (
         CustomerId int not null primary key,
         Name nvarchar(100) not null,
         Score decimal(5,2) null check (Score between 0 and 100)
     );`,
    ['create type dbo.CustomerList as table',
     'CustomerId int not null primary key',
     'Score decimal', 'between 0 and 100']);

// ── CREATE SCHEMA ──────────────────────────────────────────────────────────
await t('create_schema',
    `create schema Reporting authorization dbo;`,
    ['create schema Reporting', 'authorization dbo']);

// ── ALTER SCHEMA TRANSFER ──────────────────────────────────────────────────
await t('alter_schema_transfer',
    `alter schema Archive transfer dbo.OldOrders;`,
    ['alter schema Archive', 'transfer dbo.OldOrders']);

// ── ALTER DATABASE SCOPED CONFIGURATION ───────────────────────────────────
await t('alter_db_scoped_config',
    `alter database scoped configuration set maxdop = 4;`,
    ['alter database scoped configuration', 'set maxdop = 4']);

await t('alter_db_scoped_config_clear',
    `alter database scoped configuration clear procedure_cache;`,
    ['alter database scoped configuration', 'clear procedure_cache']);

// ── Temporal table query: FOR SYSTEM_TIME ─────────────────────────────────
await t('for_system_time_as_of',
    `select Id, Name, ValidFrom, ValidTo
     from dbo.Employees for system_time as of '2023-01-01';`,
    ['for system_time as of', "'2023-01-01'"]);

await t('for_system_time_between',
    `select * from dbo.T for system_time between '2020-01-01' and '2023-12-31';`,
    ['for system_time between', "'2020-01-01'", "'2023-12-31'"]);

await t('for_system_time_contained',
    `select * from dbo.T for system_time contained in ('2021-01-01', '2022-12-31');`,
    ['for system_time contained in', "'2021-01-01'", "'2022-12-31'"]);

await t('for_system_time_all',
    `select * from dbo.T for system_time all;`,
    ['for system_time all']);

// ── ALTER TABLE SET SYSTEM_VERSIONING ────────────────────────────────────
await t('alter_table_system_versioning_on',
    `alter table dbo.Employees
     set (system_versioning = on (history_table = dbo.EmployeesHistory));`,
    ['system_versioning = on', 'history_table = dbo.EmployeesHistory']);

await t('alter_table_system_versioning_off',
    `alter table dbo.Employees set (system_versioning = off);`,
    ['system_versioning = off']);

// ── CREATE TABLE with MEMORY_OPTIMIZED ────────────────────────────────────
await t('create_table_memory_optimized',
    `create table dbo.SessionData (
         SessionId uniqueidentifier not null,
         Data nvarchar(max) null,
         constraint PK_SessionData primary key nonclustered (SessionId)
     ) with (memory_optimized = on, durability = schema_only);`,
    ['memory_optimized = on', 'durability = schema_only']);

// ── CREATE NATIVELY COMPILED PROC ─────────────────────────────────────────
await t('native_proc',
    `create procedure dbo.usp_NativeProc
       @Id int
     with native_compilation, schemabinding, execute as owner
     as begin atomic with (transaction isolation level = snapshot, language = N'English')
         select * from dbo.T where Id = @Id;
     end;`,
    ['native_compilation', 'schemabinding',
     'transaction isolation level = snapshot', "language = N'English'"]);

// ── CREATE AGGREGATE ──────────────────────────────────────────────────────
await t('create_aggregate',
    `create aggregate dbo.GeometricMean (@value float)
     returns float
     external name MyAssembly.GeometricMean;`,
    ['create aggregate dbo.GeometricMean', 'returns float',
     'external name MyAssembly.GeometricMean']);

// ── CREATE FUNCTION scalar with EXECUTE AS ────────────────────────────────
await t('scalar_fn_execute_as',
    `create function dbo.fn_Test (@x int) returns int
     with execute as caller
     as begin return @x * 2; end;`,
    ['create function dbo.fn_Test', 'with execute as caller', 'return @x * 2']);

// ── CREATE FUNCTION with RETURNS TABLE inline ─────────────────────────────
await t('inline_tvf',
    `create function dbo.fn_GetOrders (@custId int)
     returns table
     as return (
         select Id, Amount from dbo.Orders where CustId = @custId
     );`,
    ['create function dbo.fn_GetOrders', 'returns table', 'as return',
     'select Id, Amount', 'CustId = @custId']);

// ── ALTER TABLE ADD column with DEFAULT CONSTRAINT ─────────────────────────
await t('alter_add_col_default_constraint',
    `alter table dbo.Orders
     add IsActive bit not null constraint DF_Orders_IsActive default 1;`,
    ['add IsActive bit', 'not null', 'constraint DF_Orders_IsActive', 'default 1']);

// ── ALTER TABLE SET LOCK_ESCALATION ───────────────────────────────────────
await t('alter_table_lock_escalation',
    `alter table dbo.Orders set (lock_escalation = disable);`,
    ['alter table dbo.Orders set', 'lock_escalation = disable']);

// ── DISABLE / ENABLE INDEX ─────────────────────────────────────────────────
await t('disable_index',
    `alter index IX_Orders_CustId on dbo.Orders disable;`,
    ['alter index IX_Orders_CustId', 'on dbo.Orders', 'disable']);

// ── UPDATE STATISTICS ─────────────────────────────────────────────────────
await t('update_statistics',
    `update statistics dbo.Orders IX_Orders_CustId with fullscan, norecompute;`,
    ['update statistics dbo.Orders', 'IX_Orders_CustId', 'fullscan', 'norecompute']);

console.log(`\n${ok} passed, ${fail} failed`);
