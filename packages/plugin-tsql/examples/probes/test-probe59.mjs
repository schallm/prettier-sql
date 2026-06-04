/**
 * Probe 59 — Advanced SELECT patterns, analytic functions,
 *   schema-modifying SELECT side effects, and T-SQL quirks:
 *   - SELECT with FOR XML PATH producing joined string (the "STRING_AGG before STRING_AGG" pattern)
 *   - STUFF + FOR XML PATH (classic string concatenation)
 *   - SELECT with PIVOT using dynamic columns (pattern check only)
 *   - UNPIVOT with multiple value columns
 *   - GROUPING SETS with empty set
 *   - GROUP BY () (grand total)
 *   - SELECT DISTINCT with ORDER BY on non-selected column
 *   - Multiple CTE references in different JOIN arms
 *   - Recursive CTE with string accumulation
 *   - SELECT with column aliased in WHERE (should be rejected by SQL but test graceful handling)
 *   - CASE in ORDER BY
 *   - Conditional aggregation
 *   - Multiple JOINs with same table different aliases
 *   - FULL OUTER JOIN
 *   - ROW_NUMBER in WHERE via CTE
 *   - RANK vs DENSE_RANK behavior (just format check)
 *   - PARTITION BY with multiple columns
 *   - ORDER BY in window without PARTITION BY
 *   - Complex OVER with ROWS BETWEEN
 *   - OVER with RANGE BETWEEN (default window)
 *   - LEAD with 3 args
 *   - LAG with 3 args
 *   - NTH_VALUE (not T-SQL native — skip)
 *   - RATIO_TO_REPORT (not T-SQL native — skip)
 *   - Multiple aggregates with same PARTITION BY different ORDER BY
 *   - Self-referencing CTE with UNION ALL
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
    // ── STUFF + FOR XML PATH ──────────────────────────────────────────────────
    check(
        'stuff_for_xml_path',
        `select stuff((select ',' + p.Name from dbo.Products p where p.CategoryId = c.Id order by p.Name for xml path('')), 1, 1, '') as Products from dbo.Categories c`,
        ['stuff', 'for xml path', "'%2c%2c'", 'products', 'from dbo.categories']
    ),

    // ── FULL OUTER JOIN ───────────────────────────────────────────────────────
    check(
        'full_outer_join',
        `select coalesce(l.Id, r.Id) as Id, l.Name as LeftName, r.Name as RightName from dbo.LeftTable l full join dbo.RightTable r on l.Id = r.Id`,
        ['full join', 'dbo.lefttable', 'dbo.righttable', 'coalesce']
    ),

    // ── CASE in ORDER BY ─────────────────────────────────────────────────────
    check(
        'case_in_order_by',
        `select * from dbo.Orders order by case Status when 'Urgent' then 1 when 'Active' then 2 when 'Pending' then 3 else 99 end, OrderDate desc`,
        ['order by case', 'status', "'urgent'", 'then 1', "'active'", 'then 2', 'orderdate desc']
    ),

    // ── Conditional aggregation ────────────────────────────────────────────────
    check(
        'conditional_aggregation',
        `select CustomerId, sum(case when Month(OrderDate) = 1 then Amount else 0 end) as JanTotal, sum(case when Month(OrderDate) = 2 then Amount else 0 end) as FebTotal, count(case when Status = 'Active' then 1 end) as ActiveCount from dbo.Orders group by CustomerId`,
        ['sum(case when', 'month(orderdate)', 'jantotal', 'febtotal', 'count(case when', "'active'", 'activecount']
    ),

    // ── Multiple JOINs same table different alias ──────────────────────────────
    check(
        'same_table_diff_alias',
        `select o.OrderId, a.Address as BillTo, b.Address as ShipTo from dbo.Orders o inner join dbo.Addresses a on o.BillAddressId = a.Id inner join dbo.Addresses b on o.ShipAddressId = b.Id`,
        ['inner join dbo.addresses a', 'inner join dbo.addresses b', 'billto', 'shipto']
    ),

    // ── ROW_NUMBER in CTE for pagination ─────────────────────────────────────
    check(
        'row_number_cte_pagination',
        `with Paged as (select *, row_number() over (order by OrderDate desc, OrderId) as Rn from dbo.Orders where CustomerId = @cid) select * from Paged where Rn between 21 and 30`,
        ['with paged', 'row_number', 'over', 'order by orderdate', 'rn between 21 and 30']
    ),

    // ── PARTITION BY multiple columns ─────────────────────────────────────────
    check(
        'partition_multi_col',
        `select OrderId, CustomerId, Status, sum(Amount) over (partition by CustomerId, Status) as GroupTotal, rank() over (partition by CustomerId, Status order by Amount desc) as Rnk from dbo.Orders`,
        ['partition by customerid, status', 'grouptotal', 'rank', 'rnk']
    ),

    // ── Complex OVER with ROWS BETWEEN ────────────────────────────────────────
    check(
        'rows_between_complex',
        `select OrderId, Amount, avg(Amount) over (partition by CustomerId order by OrderDate rows between 2 preceding and 2 following) as MovingAvg from dbo.Orders`,
        ['rows between 2 preceding and 2 following', 'movingavg', 'avg(amount)']
    ),

    // ── RANGE BETWEEN ─────────────────────────────────────────────────────────
    check(
        'range_between',
        `select OrderId, Amount, sum(Amount) over (partition by CustomerId order by OrderDate range between unbounded preceding and current row) as CumSum from dbo.Orders`,
        ['range between', 'unbounded preceding', 'current row', 'cumsum']
    ),

    // ── LEAD with 3 args ──────────────────────────────────────────────────────
    check(
        'lead_three_args',
        `select OrderId, Amount, lead(Amount, 2, 0.0) over (partition by CustomerId order by OrderDate) as TwoAhead from dbo.Orders`,
        ['lead', 'amount', '2', '0.0', 'partition by', 'twoahead']
    ),

    // ── LAG with 3 args ───────────────────────────────────────────────────────
    check(
        'lag_three_args',
        `select OrderId, Amount, lag(Amount, 3, -1) over (order by OrderDate) as ThreeBehind from dbo.Orders`,
        ['lag', 'amount', '3', '-1', 'threebehind']
    ),

    // ── Multiple aggregates same PARTITION ────────────────────────────────────
    check(
        'multi_agg_same_partition',
        `select OrderId, Amount, sum(Amount) over (partition by CustomerId order by OrderDate) as CumSum, avg(Amount) over (partition by CustomerId order by OrderDate) as CumAvg, count(*) over (partition by CustomerId) as TotalOrders from dbo.Orders`,
        ['sum(amount) over', 'avg(amount) over', 'count(*) over', 'cumsum', 'cumavg', 'totalorders']
    ),

    // ── GROUP BY with empty grouping set ──────────────────────────────────────
    check(
        'grouping_sets_with_empty',
        `select Year, Region, sum(Amount) as Total from dbo.Sales group by grouping sets ((Year, Region), (Year), (Region), ())`,
        ['grouping sets', 'year', 'region', 'sum(amount)', '(year, region)', '()']
    ),

    // ── Multiple CTE referenced in different joins ─────────────────────────────
    check(
        'cte_in_different_joins',
        `with Active as (select * from dbo.Orders where Status = 'Active'), Pending as (select * from dbo.Orders where Status = 'Pending') select a.CustomerId, a.Amount as ActiveAmount, p.Amount as PendingAmount from Active a full join Pending p on a.CustomerId = p.CustomerId`,
        ['with active as', 'pending as', 'full join pending', 'activeamount', 'pendingamount']
    ),

    // ── Recursive CTE with string accumulation ────────────────────────────────
    check(
        'recursive_cte_string',
        `with Paths as (select Id, Name, cast(Name as nvarchar(max)) as Path from dbo.OrgChart where ManagerId is null union all select e.Id, e.Name, p.Path + ' > ' + e.Name from dbo.OrgChart e inner join Paths p on e.ManagerId = p.Id) select * from Paths`,
        ['with paths', 'cast(name as nvarchar(max))', 'path', 'union all', 'inner join paths', 'managerid is null']
    ),

    // ── FOR XML PATH with root ────────────────────────────────────────────────
    check(
        'for_xml_path_root',
        `select Id, Name, Email from dbo.Customers where CustomerId = 42 for xml path('Customer'), root('Customers')`,
        ['for xml path', "'customer'", 'root', "'customers'"]
    ),

    // ── GROUPING_ID with rollup ────────────────────────────────────────────────
    check(
        'grouping_id_rollup',
        `select Year, Quarter, sum(Amount) as Total, grouping_id(Year, Quarter) as GId, case grouping_id(Year, Quarter) when 0 then 'Quarter' when 1 then 'Year' when 3 then 'Grand Total' end as Level from dbo.Sales group by rollup (Year, Quarter)`,
        ['grouping_id', 'rollup', "'quarter'", "'year'", "'grand total'"]
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

console.log(`\nProbe 59 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
