/**
 * Probe 46 — Window functions, JSON, XML, full-text, and advanced SELECT:
 *   - OVER() with named WINDOW clause reference
 *   - WINDOW clause (SQL Server 2022)
 *   - LAG / LEAD with default and partition
 *   - FIRST_VALUE / LAST_VALUE
 *   - PERCENTILE_CONT / PERCENTILE_DISC (WITHIN GROUP)
 *   - STRING_AGG with WITHIN GROUP ORDER BY
 *   - LISTAGG (not T-SQL but common confusion — RAISERROR if attempted)
 *   - PIVOT and UNPIVOT
 *   - FOR XML PATH with ROOT and ELEMENTS
 *   - FOR XML AUTO
 *   - FOR JSON AUTO
 *   - OPENJSON basic
 *   - OPENJSON with WITH clause
 *   - JSON_VALUE / JSON_QUERY / JSON_MODIFY
 *   - CROSS APPLY OPENJSON
 *   - CROSS APPLY STRING_SPLIT
 *   - OPENXML
 *   - sp_xml_preparedocument / sp_xml_removedocument
 *   - CONTAINS with NEAR
 *   - CONTAINSTABLE with TOP N
 *   - FREETEXTTABLE
 *   - OUTER APPLY
 *   - LATERAL JOIN (not in TSQL but CROSS/OUTER APPLY are the equivalent)
 *   - TABLESAMPLE
 *   - GROUP BY ROLLUP / CUBE / GROUPING SETS
 *   - GROUPING() function
 *   - GROUPING_ID() function
 *   - SELECT with DISTINCT + TOP
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
    // ── LAG / LEAD ────────────────────────────────────────────────────────────
    check(
        'lag_lead',
        `select OrderId, Amount, lag(Amount, 1, 0) over (partition by CustomerId order by OrderDate) as PrevAmount, lead(Amount, 1, 0) over (partition by CustomerId order by OrderDate) as NextAmount from dbo.Orders`,
        ['lag', 'lead', 'amount', '1', '0', 'partition by', 'customerid', 'order by', 'orderdate', 'prevamount', 'nextamount']
    ),

    // ── FIRST_VALUE / LAST_VALUE ──────────────────────────────────────────────
    check(
        'first_last_value',
        `select OrderId, first_value(Amount) over (partition by CustomerId order by OrderDate rows between unbounded preceding and current row) as FirstAmt, last_value(Amount) over (partition by CustomerId order by OrderDate rows between current row and unbounded following) as LastAmt from dbo.Orders`,
        ['first_value', 'last_value', 'rows between', 'unbounded preceding', 'current row', 'unbounded following']
    ),

    // ── STRING_AGG ────────────────────────────────────────────────────────────
    check(
        'string_agg',
        `select CustomerId, string_agg(ProductName, ', ') within group (order by ProductName) as Products from dbo.OrderLines group by CustomerId`,
        ['string_agg', 'productname', "', '", 'within group', 'order by', 'products', 'group by']
    ),

    // ── PERCENTILE_CONT / PERCENTILE_DISC ─────────────────────────────────────
    check(
        'percentile_cont',
        `select distinct CustomerId, percentile_cont(0.5) within group (order by Amount) over (partition by CustomerId) as MedianAmount from dbo.Orders`,
        ['percentile_cont', '0.5', 'within group', 'order by amount', 'over', 'partition by', 'medianamount']
    ),

    // ── PIVOT ─────────────────────────────────────────────────────────────────
    check(
        'pivot',
        `select * from (select Year, Quarter, Amount from dbo.Sales) src pivot (sum(Amount) for Quarter in ([Q1], [Q2], [Q3], [Q4])) pvt`,
        ['pivot', 'sum', 'for quarter in', 'q1', 'q2', 'q3', 'q4']
    ),

    // ── UNPIVOT ───────────────────────────────────────────────────────────────
    check(
        'unpivot',
        `select ProductId, Quarter, Amount from dbo.SalesPivot unpivot (Amount for Quarter in (Q1, Q2, Q3, Q4)) upvt`,
        ['unpivot', 'amount for quarter in', 'q1', 'q2', 'q3', 'q4']
    ),

    // ── FOR XML PATH ──────────────────────────────────────────────────────────
    check(
        'for_xml_path',
        `select OrderId as '@Id', CustomerName as 'Customer/Name', Amount as 'Amount' from dbo.Orders for xml path('Order'), root('Orders'), elements`,
        ['for xml', 'path', "'order'", 'root', "'orders'", 'elements']
    ),

    // ── FOR XML AUTO ──────────────────────────────────────────────────────────
    check(
        'for_xml_auto',
        `select o.OrderId, c.Name from dbo.Orders o join dbo.Customers c on o.CustomerId = c.Id for xml auto, type`,
        ['for xml auto', 'type']
    ),

    // ── FOR JSON AUTO ─────────────────────────────────────────────────────────
    check(
        'for_json_auto',
        `select OrderId, Amount, Status from dbo.Orders where CustomerId = 42 for json auto`,
        ['for json auto', 'orderid', 'amount', 'status']
    ),

    // ── OPENJSON basic ────────────────────────────────────────────────────────
    check(
        'openjson_basic',
        `select * from openjson(@json)`,
        ['openjson', '@json']
    ),

    // ── OPENJSON with WITH clause ─────────────────────────────────────────────
    check(
        'openjson_with',
        `select Id, Name, Amount from openjson(@json, '$.orders') with (Id int '$.id', Name nvarchar(100) '$.name', Amount decimal(18,2) '$.amount')`,
        ['openjson', "'$.orders'", 'with', 'id int', 'name nvarchar', 'amount decimal']
    ),

    // ── JSON_VALUE / JSON_QUERY / JSON_MODIFY ──────────────────────────────────
    check(
        'json_functions',
        `select json_value(Payload, '$.CustomerId'), json_query(Payload, '$.Items'), json_modify(Payload, '$.Status', 'Shipped') from dbo.Events`,
        ['json_value', 'json_query', 'json_modify', "'$.customerid'", "'$.items'", "'$.status'"]
    ),

    // ── CROSS APPLY STRING_SPLIT ──────────────────────────────────────────────
    check(
        'cross_apply_string_split',
        `select o.OrderId, s.value as Tag from dbo.Orders o cross apply string_split(o.Tags, ',') s`,
        ['cross apply', 'string_split', 'tags', "','", 'tag']
    ),

    // ── OUTER APPLY ───────────────────────────────────────────────────────────
    check(
        'outer_apply',
        `select o.OrderId, t.ProductId, t.Qty from dbo.Orders o outer apply dbo.fn_TopItem(o.OrderId) t`,
        ['outer apply', 'fn_topitem', 'orderid', 'productid', 'qty']
    ),

    // ── TABLESAMPLE ───────────────────────────────────────────────────────────
    check(
        'tablesample',
        `select * from dbo.Orders tablesample (10 percent)`,
        ['tablesample', '10', 'percent']
    ),

    // ── GROUP BY ROLLUP ───────────────────────────────────────────────────────
    check(
        'group_by_rollup',
        `select Year, Month, sum(Amount) as Total from dbo.Sales group by rollup (Year, Month)`,
        ['group by', 'rollup', 'year', 'month', 'sum', 'total']
    ),

    // ── GROUP BY CUBE ─────────────────────────────────────────────────────────
    check(
        'group_by_cube',
        `select Region, Product, sum(Sales) as Total from dbo.SalesFact group by cube (Region, Product)`,
        ['group by', 'cube', 'region', 'product', 'sum', 'total']
    ),

    // ── GROUPING SETS ─────────────────────────────────────────────────────────
    check(
        'grouping_sets',
        `select Year, Quarter, Region, sum(Amount) from dbo.Sales group by grouping sets ((Year, Quarter), (Year, Region), (Year), ())`,
        ['grouping sets', 'year', 'quarter', 'region', 'sum']
    ),

    // ── GROUPING() function ───────────────────────────────────────────────────
    check(
        'grouping_function',
        `select Year, Month, sum(Amount) as Total, grouping(Year) as IsYearTotal, grouping(Month) as IsMonthTotal from dbo.Sales group by rollup (Year, Month)`,
        ['grouping(year)', 'grouping(month)', 'isyeartotal', 'ismonthtotal', 'rollup']
    ),

    // ── GROUPING_ID ───────────────────────────────────────────────────────────
    check(
        'grouping_id',
        `select Year, Month, sum(Amount) as Total, grouping_id(Year, Month) as GId from dbo.Sales group by rollup (Year, Month)`,
        ['grouping_id', 'year', 'month', 'gid']
    ),

    // ── DISTINCT + TOP ────────────────────────────────────────────────────────
    check(
        'distinct_top',
        `select distinct top 10 CustomerId, Status from dbo.Orders order by CustomerId`,
        ['distinct', 'top', '10', 'customerid', 'status', 'order by']
    ),

    // ── CROSS APPLY OPENJSON ──────────────────────────────────────────────────
    check(
        'cross_apply_openjson',
        `select o.OrderId, j.ProductId, j.Qty from dbo.Orders o cross apply openjson(o.ItemsJson) with (ProductId int '$.pid', Qty int '$.qty') j`,
        ['cross apply', 'openjson', 'itemsjson', 'productid', 'qty']
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

console.log(`\nProbe 46 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
