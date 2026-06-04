/**
 * Probe 60 — Temporal tables, ledger tables, Always On,
 *   system catalog queries, dynamic management views,
 *   and SQL Server 2022 features:
 *   - FOR SYSTEM_TIME AS OF / BETWEEN / FROM ... TO / CONTAINED IN
 *   - FOR SYSTEM_TIME ALL
 *   - Temporal join between versioned tables
 *   - CREATE LEDGER TABLE
 *   - SELECT from system catalog views (sys.objects, sys.columns, etc.)
 *   - SELECT from DMVs (sys.dm_exec_requests, etc.)
 *   - OBJECT_DEFINITION()
 *   - sys.sp_helptext equivalent
 *   - SELECT with TRY_CAST in WHERE
 *   - ISJSON with strict mode (SQL 2022)
 *   - JSON_OBJECT / JSON_ARRAY (SQL 2022)
 *   - GREATEST / LEAST (SQL 2022)
 *   - DATE_BUCKET (SQL 2022)
 *   - GENERATE_SERIES (SQL 2022)
 *   - IS [NOT] DISTINCT FROM (SQL 2022)
 *   - TRIM with LEADING / TRAILING / BOTH (SQL 2022)
 *   - LTRIM / RTRIM with characters arg (SQL 2022)
 *   - Window functions with IGNORE NULLS
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
    // ── Temporal: FOR SYSTEM_TIME AS OF ────────────────────────────────────────
    check(
        'system_time_as_of',
        `select * from dbo.Orders for system_time as of '2024-01-01'`,
        ['for system_time', 'as of', "'2024-01-01'"]
    ),
    check(
        'system_time_between',
        `select * from dbo.Orders for system_time between '2024-01-01' and '2024-12-31'`,
        ['for system_time', 'between', "'2024-01-01'", 'and', "'2024-12-31'"]
    ),
    check(
        'system_time_from_to',
        `select * from dbo.Orders for system_time from '2024-01-01' to '2024-12-31'`,
        ['for system_time', 'from', "'2024-01-01'", 'to', "'2024-12-31'"]
    ),
    check(
        'system_time_contained',
        `select * from dbo.Orders for system_time contained in ('2024-01-01', '2024-12-31')`,
        ['for system_time', 'contained in', "'2024-01-01'", "'2024-12-31'"]
    ),
    check(
        'system_time_all',
        `select *, ValidFrom, ValidTo from dbo.Orders for system_time all`,
        ['for system_time all', 'validfrom', 'validto']
    ),

    // ── System catalog queries ────────────────────────────────────────────────
    check(
        'sys_objects_query',
        `select o.name, o.type_desc, o.create_date from sys.objects o where o.schema_id = schema_id('dbo') and o.type in ('U', 'V', 'P', 'FN')`,
        ['sys.objects', 'type_desc', 'create_date', 'schema_id', "'dbo'", "type in", "'u'", "'v'"]
    ),
    check(
        'sys_columns_query',
        `select c.name, t.name as TypeName, c.max_length, c.is_nullable from sys.columns c inner join sys.types t on c.user_type_id = t.user_type_id where c.object_id = object_id('dbo.Orders')`,
        ['sys.columns', 'sys.types', 'typename', 'max_length', 'is_nullable', 'user_type_id']
    ),

    // ── DMV query ─────────────────────────────────────────────────────────────
    check(
        'dmv_exec_requests',
        `select session_id, status, command, cpu_time, total_elapsed_time, wait_type from sys.dm_exec_requests where status != 'sleeping'`,
        ['sys.dm_exec_requests', 'session_id', 'status', 'command', 'cpu_time', 'wait_type']
    ),

    // ── JSON_OBJECT / JSON_ARRAY (SQL 2022) ───────────────────────────────────
    check(
        'json_object_2022',
        `select json_object('id': OrderId, 'amount': Amount, 'status': Status) as OrderJson from dbo.Orders`,
        ['json_object', "'id'", 'orderid', "'amount'", 'amount', "'status'", 'orderjson']
    ),
    check(
        'json_array_2022',
        `select json_array(1, 2, 3, 'a', null) as Arr`,
        ['json_array', '1', '2', '3', "'a'", 'null', 'arr']
    ),

    // ── GREATEST / LEAST (SQL 2022) ───────────────────────────────────────────
    check(
        'greatest_least',
        `select greatest(Price, MinPrice, FloorPrice) as EffectivePrice, least(Weight, MaxWeight, LimitWeight) as ActualWeight from dbo.Products`,
        ['greatest', 'price', 'minprice', 'floorprice', 'effectiveprice', 'least', 'weight', 'maxweight', 'actualweight']
    ),

    // ── DATE_BUCKET (SQL 2022) ─────────────────────────────────────────────────
    check(
        'date_bucket',
        `select date_bucket(week, 1, OrderDate) as WeekBucket, count(*) as OrderCount from dbo.Orders group by date_bucket(week, 1, OrderDate)`,
        ['date_bucket', 'week', '1', 'orderdate', 'weekbucket', 'count', 'ordercount']
    ),

    // ── GENERATE_SERIES (SQL 2022) ────────────────────────────────────────────
    check(
        'generate_series',
        `select value as N from generate_series(1, 100, 1)`,
        ['generate_series', '1', '100', 'value']
    ),
    check(
        'generate_series_dates',
        `select dateadd(day, gs.value, '2024-01-01') as DateVal from generate_series(0, 365) gs`,
        ['generate_series', '0', '365', 'dateadd', 'day', '2024-01-01', 'dateval']
    ),

    // ── IS DISTINCT FROM (SQL 2022) ───────────────────────────────────────────
    check(
        'is_distinct_from',
        `select * from dbo.Orders where Amount is distinct from 0`,
        ['is distinct from', '0']
    ),
    check(
        'is_not_distinct_from',
        `select * from dbo.Orders where Status is not distinct from OldStatus`,
        ['is not distinct from', 'status', 'oldstatus']
    ),

    // ── TRIM with direction (SQL 2022) ────────────────────────────────────────
    check(
        'trim_leading',
        `select trim(leading '.' from ProductCode) from dbo.Products`,
        ['trim', 'leading', "'.'",'from productcode']
    ),
    check(
        'trim_trailing',
        `select trim(trailing '-' from ProductCode) from dbo.Products`,
        ['trim', 'trailing', "'-'", 'from productcode']
    ),
    check(
        'trim_both',
        `select trim(both ' ' from ProductCode) from dbo.Products`,
        ['trim', 'both', "' '", 'from productcode']
    ),

    // ── OBJECT_DEFINITION ─────────────────────────────────────────────────────
    check(
        'object_definition',
        `select object_definition(object_id('dbo.GetOrders'))`,
        ['object_definition', 'object_id', 'dbo.getorders']
    ),

    // ── Ledger table (SQL 2022) ────────────────────────────────────────────────
    check(
        'create_ledger_table',
        `create table dbo.Transactions (Id int primary key, Amount decimal(18,2) not null, UserId int not null) with (system_versioning = on, ledger = on)`,
        ['create table', 'transactions', 'system_versioning', 'on', 'ledger = on']
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

console.log(`\nProbe 60 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
