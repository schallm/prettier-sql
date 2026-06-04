/**
 * Ninth probe — focused areas: proc/function options, temporal tables,
 * ALTER TABLE specifics, and less-common CREATE statements.
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

// ── CREATE PROC with ENCRYPTION ───────────────────────────────────────────
await t('proc_with_encryption',
    `create procedure dbo.usp_Secret with encryption, recompile as begin select 1; end;`,
    ['with encryption', 'recompile']);

// ── CREATE OR ALTER PROC ───────────────────────────────────────────────────
await t('create_or_alter_proc',
    `create or alter procedure dbo.usp_Test @Id int as begin select @Id; end;`,
    ['create or alter procedure', '@Id int']);

// ── CREATE OR ALTER FUNCTION ───────────────────────────────────────────────
await t('create_or_alter_fn',
    `create or alter function dbo.fn_Test(@x int) returns int as begin return @x * 2; end;`,
    ['create or alter function', '@x int', 'return @x * 2']);

// ── ALTER PROCEDURE ────────────────────────────────────────────────────────
await t('alter_procedure_with_opts',
    `alter procedure dbo.usp_Test @Id int with recompile as begin select @Id; end;`,
    ['alter procedure', 'with recompile', '@Id int']);

// ── Proc: RETURN with expression ──────────────────────────────────────────
await t('proc_return_expr',
    `create procedure dbo.usp_Status @Active bit as
     begin
        if @Active = 1 return 1;
        return 0;
     end;`,
    ['if @Active = 1 return 1', 'return 0']);

// ── Table-valued function with SCHEMABINDING ──────────────────────────────
await t('tvf_with_schemabinding',
    `create function dbo.fn_GetActive() returns table
     with schemabinding
     as return (select Id, Name from dbo.Customers where IsActive = 1);`,
    ['with schemabinding', 'IsActive = 1']);

// ── Temporal table (SYSTEM VERSIONING) ────────────────────────────────────
await t('temporal_table',
    `create table dbo.Products (
        Id int primary key,
        Name nvarchar(100) not null,
        Price decimal(10,2),
        SysStart datetime2 generated always as row start not null,
        SysEnd datetime2 generated always as row end not null,
        period for system_time (SysStart, SysEnd)
     ) with (system_versioning = on (history_table = dbo.ProductsHistory));`,
    ['generated always as row start', 'generated always as row end',
     'period for system_time', 'system_versioning = on', 'dbo.ProductsHistory']);

// ── Temporal table: AS OF query ────────────────────────────────────────────
await t('temporal_as_of',
    `select * from dbo.Products for system_time as of '2024-01-01';`,
    ['for system_time as of', "'2024-01-01'"]);

// ── Temporal table: BETWEEN ────────────────────────────────────────────────
await t('temporal_between',
    `select * from dbo.Products for system_time between '2024-01-01' and '2024-12-31';`,
    ["for system_time between '2024-01-01' and '2024-12-31'"]);

// ── ALTER TABLE: SWITCH PARTITION ─────────────────────────────────────────
await t('alter_switch',
    `alter table dbo.Orders switch partition 2 to dbo.OrdersArchive partition 1;`,
    ['switch partition 2', 'dbo.OrdersArchive partition 1']);

// ── ALTER TABLE: REBUILD ──────────────────────────────────────────────────
await t('alter_rebuild',
    `alter table dbo.Orders rebuild partition = all with (online = on);`,
    ['rebuild partition = all', 'online = on']);

// ── ALTER TABLE: SET with LOCK ESCALATION ─────────────────────────────────
await t('alter_set_lock',
    `alter table dbo.Orders set (lock_escalation = disable);`,
    ['set (lock_escalation = disable)']);

// ── CREATE SCHEMA with authorization ─────────────────────────────────────
await t('create_schema_auth',
    `create schema Reporting authorization dbo;`,
    ['create schema Reporting', 'authorization dbo']);

// ── ALTER SCHEMA TRANSFER ─────────────────────────────────────────────────
await t('alter_schema_transfer',
    `alter schema Reporting transfer dbo.ReportOrders;`,
    ['alter schema Reporting', 'transfer', 'dbo.ReportOrders']);

// ── CREATE TYPE (table) ────────────────────────────────────────────────────
await t('create_type_table',
    `create type dbo.IntList as table (Value int not null);`,
    // 'Value' is in reserved words → gets [Value] brackets — semantics preserved
    ['create type dbo.IntList as table', 'int not null']);

// ── CREATE TYPE (scalar) ──────────────────────────────────────────────────
await t('create_type_scalar',
    `create type dbo.Email from nvarchar(256) not null;`,
    ['create type dbo.Email from nvarchar(256)', 'not null']);

// ── CREATE SYNONYM ────────────────────────────────────────────────────────
await t('create_synonym',
    `create synonym dbo.OldName for dbo.NewName;`,
    ['create synonym dbo.OldName', 'for dbo.NewName']);

// ── ALTER SEQUENCE ────────────────────────────────────────────────────────
await t('alter_sequence',
    `alter sequence dbo.OrderSeq restart with 1000 increment by 5;`,
    ['alter sequence dbo.OrderSeq', 'restart with 1000', 'increment by 5']);

// ── CREATE PARTITION FUNCTION ─────────────────────────────────────────────
await t('create_partition_fn',
    `create partition function pf_Date(date) as range right for values ('2020-01-01', '2021-01-01', '2022-01-01');`,
    ['create partition function pf_Date', 'range right', "'2020-01-01'"]);

// ── CREATE PARTITION SCHEME ───────────────────────────────────────────────
await t('create_partition_scheme',
    `create partition scheme ps_Date as partition pf_Date to (fg2020, fg2021, fg2022, fg_catch);`,
    ['create partition scheme ps_Date', 'partition pf_Date', 'fg2020', 'fg_catch']);

// ── UPDATE STATISTICS ─────────────────────────────────────────────────────
await t('update_statistics',
    `update statistics dbo.Orders with fullscan, norecompute;`,
    ['update statistics dbo.Orders', 'fullscan', 'norecompute']);

// ── CREATE STATISTICS with options ────────────────────────────────────────
await t('create_stats_opts',
    `create statistics st_Orders on dbo.Orders (CustId, OrderDate) with fullscan;`,
    ['create statistics st_Orders', 'dbo.Orders (CustId, OrderDate)', 'fullscan']);

// ── DROP STATISTICS ────────────────────────────────────────────────────────
await t('drop_statistics',
    `drop statistics dbo.Orders.st_Status;`,
    ['drop statistics', 'dbo.Orders.st_Status']);

// ── CREATE COLUMNSTORE INDEX ──────────────────────────────────────────────
await t('create_columnstore',
    `create clustered columnstore index CCI_Orders on dbo.Orders;`,
    ['clustered columnstore index CCI_Orders', 'dbo.Orders']);

await t('create_nonclustered_columnstore',
    `create nonclustered columnstore index NCCI_Orders on dbo.Orders (CustId, OrderDate, Amount);`,
    ['nonclustered columnstore index NCCI_Orders', 'CustId, OrderDate, Amount']);

// ── ALTER INDEX: REORGANIZE ───────────────────────────────────────────────
await t('alter_index_reorganize',
    `alter index IX_Orders on dbo.Orders reorganize;`,
    ['alter index IX_Orders', 'reorganize']);

// ── ALTER INDEX: DISABLE ──────────────────────────────────────────────────
await t('alter_index_disable',
    `alter index all on dbo.Orders disable;`,
    ['alter index all', 'dbo.Orders', 'disable']);

// ── Inline function (RETURNS TABLE) ──────────────────────────────────────
await t('inline_tvf',
    `create function dbo.fn_Orders(@CustId int) returns table
     as return (
         select Id, Amount, OrderDate
         from dbo.Orders
         where CustId = @CustId and IsActive = 1
     );`,
    ['returns table', 'CustId = @CustId', 'IsActive = 1']);

// ── OPENJSON with explicit schema ─────────────────────────────────────────
await t('openjson_schema',
    `select * from openjson(@json, '$.items') with (
        Id int '$.id',
        Name nvarchar(100) '$.name',
        Price decimal(10,2) '$.price'
     );`,
    ["openjson(@json, '$.items')", "'$.id'", "'$.price'"]);

// ── EXECUTE AS OWNER ──────────────────────────────────────────────────────
await t('execute_as_owner',
    `create procedure dbo.usp_Admin with execute as owner as begin select 1; end;`,
    ['execute as owner']);

// ── ALTER AUTHORIZATION ───────────────────────────────────────────────────
await t('alter_authorization',
    `alter authorization on object::dbo.Orders to dbo;`,
    ['alter authorization', 'object::dbo.Orders', 'to dbo']);

// ── BULK INSERT with error handling ───────────────────────────────────────
await t('bulk_insert_maxerrors',
    // Use double-backslash to prevent JS escape sequences (\f = form feed!)
    `bulk insert dbo.Staging from 'C:\\data\\file.csv'
     with (maxerrors = 10, errorfile = 'C:\\errors.log', fieldterminator = ',');`,
    ['maxerrors = 10', "errorfile = 'C:", 'fieldterminator']);

console.log(`\n${ok} passed, ${fail} failed`);
