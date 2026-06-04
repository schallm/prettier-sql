/**
 * Probe 51 — Complex stored procedures, functions with edge cases,
 *   view options, schema-bound objects, inline TVFs,
 *   OUTPUT clause in INSERT/UPDATE/DELETE,
 *   OUTPUT INTO in MERGE,
 *   BULK INSERT,
 *   OPENQUERY / OPENROWSET / OPENDATASOURCE,
 *   linked server four-part queries,
 *   SELECT INTO new table,
 *   SELECT INTO #temp table,
 *   DROP TABLE IF EXISTS,
 *   DROP INDEX IF EXISTS,
 *   DROP PROCEDURE IF EXISTS,
 *   DROP FUNCTION IF EXISTS,
 *   DROP VIEW IF EXISTS,
 *   TRUNCATE TABLE with partition,
 *   ALTER TABLE ALTER COLUMN,
 *   ALTER TABLE ENABLE/DISABLE TRIGGER,
 *   ALTER TABLE SWITCH PARTITION,
 *   CREATE FULLTEXT INDEX,
 *   DROP FULLTEXT INDEX,
 *   CREATE SPATIAL INDEX,
 *   CREATE XML INDEX
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
    // ── SELECT INTO ───────────────────────────────────────────────────────────
    check(
        'select_into_new_table',
        `select OrderId, CustomerId, Amount into dbo.OrdersArchive from dbo.Orders where OrderDate < '2020-01-01'`,
        ['select', 'into dbo.ordersarchive', 'from dbo.orders', 'orderdate']
    ),
    check(
        'select_into_temp',
        `select OrderId, Amount into #TempOrders from dbo.Orders where Status = 'Active'`,
        ['select', 'into #temporders', 'from dbo.orders', 'status']
    ),

    // ── OUTPUT clause in DML ──────────────────────────────────────────────────
    check(
        'insert_output',
        `insert into dbo.Orders (CustomerId, Amount) output inserted.OrderId, inserted.Amount into @inserted (OrderId, Amount) values (42, 100)`,
        ['output', 'inserted.orderid', 'inserted.amount', 'into @inserted']
    ),
    check(
        'update_output',
        `update dbo.Orders set Status = 'Shipped' output deleted.Status as OldStatus, inserted.Status as NewStatus, inserted.OrderId where OrderId = 42`,
        ['output', 'deleted.status', 'inserted.status', 'oldstatus', 'newstatus']
    ),
    check(
        'delete_output',
        `delete from dbo.Logs output deleted.LogId, deleted.Message into @Deleted (LogId, Message) where LogDate < dateadd(month, -1, getdate())`,
        ['output', 'deleted.logid', 'deleted.message', 'into @deleted']
    ),

    // ── DROP IF EXISTS ────────────────────────────────────────────────────────
    check(
        'drop_table_if_exists',
        `drop table if exists dbo.TempData`,
        ['drop table', 'if exists', 'dbo.tempdata']
    ),
    check(
        'drop_index_if_exists',
        `drop index if exists IX_Orders_Date on dbo.Orders`,
        ['drop index', 'if exists', 'ix_orders_date', 'on dbo.orders']
    ),
    check(
        'drop_proc_if_exists',
        `drop procedure if exists dbo.GetOrders`,
        ['drop procedure', 'if exists', 'dbo.getorders']
    ),
    check(
        'drop_function_if_exists',
        `drop function if exists dbo.fn_GetTotal`,
        ['drop function', 'if exists', 'dbo.fn_gettotal']
    ),
    check(
        'drop_view_if_exists',
        `drop view if exists dbo.vActiveOrders`,
        ['drop view', 'if exists', 'dbo.vactiveorders']
    ),

    // ── ALTER TABLE ALTER COLUMN ──────────────────────────────────────────────
    check(
        'alter_column',
        `alter table dbo.Orders alter column Status nvarchar(50) not null`,
        ['alter table', 'alter column', 'status', 'nvarchar', 'not null']
    ),
    check(
        'alter_column_nullable',
        `alter table dbo.Orders alter column Notes nvarchar(max) null`,
        ['alter table', 'alter column', 'notes', 'nvarchar(max)', 'null']
    ),

    // ── ALTER TABLE ENABLE/DISABLE TRIGGER ────────────────────────────────────
    check(
        'enable_trigger',
        `alter table dbo.Orders enable trigger trgOrderAudit`,
        ['alter table', 'enable trigger', 'trgorderaudit']
    ),
    check(
        'disable_trigger',
        `alter table dbo.Orders disable trigger all`,
        ['alter table', 'disable trigger', 'all']
    ),

    // ── BULK INSERT ───────────────────────────────────────────────────────────
    check(
        'bulk_insert',
        `bulk insert dbo.Orders from 'C:\\data\\orders.csv' with (fieldterminator = ',', rowterminator = '\n', firstrow = 2)`,
        ['bulk insert', 'dbo.orders', 'orders.csv', 'fieldterminator', "','", 'firstrow']
    ),

    // ── Linked server four-part name ──────────────────────────────────────────
    check(
        'linked_server_query',
        `select * from LinkedServer.RemoteDb.dbo.Orders where Status = 'Active'`,
        ['linkedserver.remotedb.dbo.orders', 'status', "'active'"]
    ),

    // ── OPENQUERY ─────────────────────────────────────────────────────────────
    check(
        'openquery',
        `select * from openquery(LinkedServer, 'select Id, Name from RemoteDb.dbo.Customers')`,
        ['openquery', 'linkedserver', 'id', 'name', 'customers']
    ),

    // ── TRUNCATE TABLE with partition ─────────────────────────────────────────
    check(
        'truncate_partition',
        `truncate table dbo.Sales with (partitions (1, 2, 3 to 5))`,
        ['truncate table', 'dbo.sales', 'with', 'partitions', '1', '2', '3']
    ),

    // ── VIEW with SCHEMABINDING ───────────────────────────────────────────────
    check(
        'view_schemabinding',
        `create view dbo.vOrderSummary with schemabinding as select o.CustomerId, count_big(*) as OrderCount, sum(o.Amount) as Total from dbo.Orders o group by o.CustomerId`,
        ['create view', 'with schemabinding', 'count_big', 'sum', 'group by']
    ),

    // ── Inline TVF ────────────────────────────────────────────────────────────
    check(
        'inline_tvf',
        `create function dbo.fn_GetOrdersByCustomer (@CustomerId int) returns table as return (select OrderId, Amount, Status from dbo.Orders where CustomerId = @CustomerId)`,
        ['create function', 'fn_getordersbycustomer', 'returns table', 'return', 'orderid', 'amount', 'status']
    ),

    // ── Multi-statement TVF ───────────────────────────────────────────────────
    check(
        'multi_stmt_tvf',
        `create function dbo.fn_Split(@str nvarchar(max), @delim nchar(1)) returns @result table (Item nvarchar(max)) as begin insert into @result select value from string_split(@str, @delim) return end`,
        ['create function', 'fn_split', 'returns @result table', 'insert into @result', 'string_split', 'return']
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

console.log(`\nProbe 51 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
