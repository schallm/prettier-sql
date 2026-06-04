/**
 * Probe 24 — PIVOT/UNPIVOT, APPLY, OUTPUT clause, TABLESAMPLE,
 *             SEQUENCE functions, temp tables, common T-SQL patterns
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
    // ── PIVOT ─────────────────────────────────────────────────────────────────
    check(
        'pivot_basic',
        `select * from (select Year, Quarter, Amount from Sales) as src pivot (sum(Amount) for Quarter in ([Q1],[Q2],[Q3],[Q4])) as pvt`,
        ['pivot', 'sum(amount)', 'for', 'quarter', 'in', '[q1]', '[q2]', '[q3]', '[q4]']
    ),

    // ── UNPIVOT ───────────────────────────────────────────────────────────────
    check(
        'unpivot_basic',
        `select ProductCode, Attribute, Value from dbo.Products unpivot (Value for Attribute in (Color, Size, Weight)) as upvt`,
        ['unpivot', 'value', 'for', 'attribute', 'in', 'color', 'size', 'weight']
    ),

    // ── CROSS APPLY / OUTER APPLY ─────────────────────────────────────────────
    check(
        'cross_apply',
        `select o.OrderId, i.ItemName from dbo.Orders o cross apply dbo.GetOrderItems(o.OrderId) i`,
        ['cross', 'apply', 'getorderitems', 'o.orderid']
    ),
    check(
        'outer_apply',
        `select c.CustomerId, o.OrderDate from dbo.Customers c outer apply (select top 1 OrderDate from dbo.Orders where CustomerId = c.CustomerId order by OrderDate desc) o`,
        ['outer', 'apply', 'customerid', 'orderdate']
    ),

    // ── OUTPUT clause ─────────────────────────────────────────────────────────
    check(
        'output_insert',
        `insert into dbo.Orders (CustomerId, OrderDate) output inserted.OrderId, inserted.OrderDate into dbo.OrderLog values (1, getdate())`,
        ['output', 'inserted.orderid', 'inserted.orderdate', 'into', 'dbo.orderlog']
    ),
    check(
        'output_delete',
        `delete from dbo.Orders output deleted.OrderId, deleted.CustomerId where OrderDate < '2020-01-01'`,
        ['output', 'deleted.orderid', 'deleted.customerid']
    ),
    check(
        'output_update',
        `update dbo.Orders set Status = 'Shipped' output deleted.Status, inserted.Status, inserted.OrderId where OrderId = 1`,
        ['output', 'deleted.status', 'inserted.status', 'inserted.orderid']
    ),

    // ── TABLESAMPLE ───────────────────────────────────────────────────────────
    check(
        'tablesample',
        `select * from dbo.Orders tablesample (10 percent)`,
        ['tablesample', '10', 'percent']
    ),
    check(
        'tablesample_rows',
        `select * from dbo.Orders tablesample system (1000 rows) repeatable (42)`,
        ['tablesample', 'system', '1000', 'rows', 'repeatable', '42']
    ),

    // ── NEXT VALUE FOR (sequence) ─────────────────────────────────────────────
    check(
        'next_value_for',
        `select next value for dbo.OrderSeq`,
        ['next', 'value', 'for', 'dbo.orderseq']
    ),
    check(
        'next_value_for_over',
        `select OrderId, next value for dbo.OrderSeq over (order by OrderId) as SeqNum from dbo.Orders`,
        ['next', 'value', 'for', 'dbo.orderseq', 'over', 'order by', 'seqnum']
    ),

    // ── TEMP TABLES ───────────────────────────────────────────────────────────
    check(
        'create_temp_table',
        `create table #TempOrders (OrderId int not null, CustomerId int not null, OrderDate date not null)`,
        ['create', 'table', '#temporders', 'orderid', 'customerid', 'orderdate']
    ),
    check(
        'create_global_temp',
        `create table ##GlobalTemp (Id int not null primary key, Name nvarchar(100) not null)`,
        ['##globaltemp', 'id', 'name']
    ),
    check(
        'select_into_temp',
        `select OrderId, CustomerId into #TempOrders from dbo.Orders where OrderDate > '2024-01-01'`,
        ['select', 'into', '#temporders', 'orderid', 'customerid']
    ),

    // ── MERGE ─────────────────────────────────────────────────────────────────
    check(
        'merge_output',
        `merge dbo.Target as t using dbo.Source as s on t.Id = s.Id when matched then update set t.Name = s.Name when not matched then insert (Id, Name) values (s.Id, s.Name) output $action, inserted.Id;`,
        ['merge', 'using', 'when', 'matched', 'update', 'when', 'not', 'matched', 'insert', 'output', '$action', 'inserted.id']
    ),

    // ── TRY_CAST / TRY_CONVERT ────────────────────────────────────────────────
    check(
        'try_cast',
        `select try_cast('abc' as int)`,
        ['try_cast', 'abc', 'int']
    ),
    check(
        'try_convert',
        `select try_convert(datetime2, '2024-01-01', 126)`,
        ['try_convert', 'datetime2', '2024-01-01', '126']
    ),

    // ── IIF ───────────────────────────────────────────────────────────────────
    check(
        'iif',
        `select iif(Amount > 1000, 'Large', 'Small') from dbo.Orders`,
        ['iif', 'amount', '1000', 'large', 'small']
    ),

    // ── CHOOSE ───────────────────────────────────────────────────────────────
    check(
        'choose',
        `select choose(DayOfWeek, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun') from dbo.Calendar`,
        ['choose', 'dayofweek', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    ),

    // ── FORMAT ───────────────────────────────────────────────────────────────
    check(
        'format_function',
        `select format(getdate(), 'yyyy-MM-dd')`,
        ['format', 'getdate', 'yyyy-mm-dd']
    ),

    // ── STRING_SPLIT / STRING_AGG ─────────────────────────────────────────────
    check(
        'string_split',
        `select value from string_split('a,b,c', ',')`,
        ['string_split', 'a,b,c', 'value']
    ),
    check(
        'string_agg',
        `select string_agg(Name, ', ') within group (order by Name) from dbo.Tags`,
        ['string_agg', 'name', 'within', 'group', 'order by']
    ),

    // ── OPENJSON ──────────────────────────────────────────────────────────────
    check(
        'openjson',
        `select j.Id, j.Name from openjson(@json) with (Id int '$.id', Name nvarchar(100) '$.name') as j`,
        ['openjson', 'id', 'name', '$.id', '$.name']
    ),

    // ── GENERATE_SERIES ──────────────────────────────────────────────────────
    check(
        'generate_series',
        `select value from generate_series(1, 10)`,
        ['generate_series', '1', '10', 'value']
    ),

    // ── ROLLUP / CUBE / GROUPING SETS ─────────────────────────────────────────
    check(
        'rollup',
        `select Year, Quarter, sum(Amount) from Sales group by rollup(Year, Quarter)`,
        ['rollup', 'year', 'quarter', 'sum(amount)']
    ),
    check(
        'cube',
        `select Year, Quarter, sum(Amount) from Sales group by cube(Year, Quarter)`,
        ['cube', 'year', 'quarter']
    ),
    check(
        'grouping_sets',
        `select Year, Quarter, Region, sum(Amount) from Sales group by grouping sets((Year, Quarter), (Region), ())`,
        ['grouping', 'sets', 'year', 'quarter', 'region']
    ),

    // ── ROW_NUMBER / RANK / DENSE_RANK ───────────────────────────────────────
    check(
        'row_number_partition',
        `select OrderId, CustomerId, row_number() over (partition by CustomerId order by OrderDate desc) as RowNum from dbo.Orders`,
        ['row_number', 'over', 'partition', 'by', 'customerid', 'order by', 'orderdate', 'rownum']
    ),
    check(
        'lag_lead',
        `select OrderDate, lag(OrderDate, 1) over (order by OrderDate) as PrevDate, lead(OrderDate, 1) over (order by OrderDate) as NextDate from dbo.Orders`,
        ['lag', 'lead', 'prevdate', 'nextdate']
    ),

    // ── CROSS JOIN ────────────────────────────────────────────────────────────
    check(
        'cross_join',
        `select a.Id, b.Id from TableA a cross join TableB b`,
        ['cross', 'join', 'tablea', 'tableb']
    ),

    // ── FULL OUTER JOIN ───────────────────────────────────────────────────────
    check(
        'full_outer_join',
        `select a.Id, b.Id from TableA a full outer join TableB b on a.Key = b.Key`,
        ['full', 'outer', 'join', 'tablea', 'tableb', 'key']
    ),

    // ── EXCEPT / INTERSECT ───────────────────────────────────────────────────
    check(
        'except',
        `select Id from TableA except select Id from TableB`,
        ['except', 'tablea', 'tableb']
    ),
    check(
        'intersect',
        `select Id from TableA intersect select Id from TableB`,
        ['intersect', 'tablea', 'tableb']
    ),

    // ── VALUES CTE ───────────────────────────────────────────────────────────
    check(
        'values_cte',
        `with Numbers as (select 1 as n union all select n + 1 from Numbers where n < 10) select n from Numbers`,
        ['with', 'numbers', 'union', 'all', 'n + 1', 'select', 'n', 'from', 'numbers']
    ),

    // ── TRUNCATE TABLE ────────────────────────────────────────────────────────
    check(
        'truncate_table',
        `truncate table dbo.TempData`,
        ['truncate', 'table', 'dbo.tempdata']
    ),
    check(
        'truncate_with_partition',
        `truncate table dbo.BigTable with (partitions (1, 2, 3 to 5))`,
        ['truncate', 'table', 'dbo.bigtable', 'partitions', '1', '2', '3', '5']
    ),

    // ── DROP TABLE IF EXISTS ──────────────────────────────────────────────────
    check(
        'drop_table_if_exists',
        `drop table if exists #TempOrders`,
        ['drop', 'table', 'if', 'exists', '#temporders']
    ),

    // ── ALTER TABLE SWITCH PARTITION ─────────────────────────────────────────
    check(
        'alter_table_switch',
        `alter table dbo.SalesCurrent switch partition 3 to dbo.SalesArchive partition 1`,
        ['alter', 'table', 'switch', 'partition', '3', 'to', 'dbo.salesarchive']
    ),

    // ── ENABLE / DISABLE TRIGGER ──────────────────────────────────────────────
    check(
        'enable_trigger',
        `enable trigger trgAudit on dbo.Orders`,
        ['enable', 'trigger', 'trgaudit', 'on', 'dbo.orders']
    ),
    check(
        'disable_trigger',
        `disable trigger trgAudit on dbo.Orders`,
        ['disable', 'trigger', 'trgaudit', 'on', 'dbo.orders']
    ),
    check(
        'enable_trigger_all',
        `enable trigger all on dbo.Orders`,
        ['enable', 'trigger', 'all', 'dbo.orders']
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

console.log(`\nProbe 24 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 250)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
