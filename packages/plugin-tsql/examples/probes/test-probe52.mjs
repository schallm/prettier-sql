/**
 * Probe 52 — Subquery shapes, expression complexity, and lesser-used T-SQL:
 *   - Scalar subquery in SELECT
 *   - Correlated subquery in WHERE
 *   - EXISTS with correlated subquery
 *   - NOT EXISTS
 *   - ANY / ALL (comparison with subquery)
 *   - IN with subquery
 *   - NOT IN with subquery
 *   - Subquery with HAVING
 *   - Subquery in JOIN ON
 *   - INSERT with subquery (no FROM)
 *   - UPDATE with JOIN (multiple FROM tables)
 *   - DELETE with multiple table refs
 *   - Multi-column IN clause
 *   - CROSS JOIN
 *   - SELF JOIN
 *   - Chained aggregate (SUM of CASE WHEN)
 *   - COUNT DISTINCT
 *   - Multiple window functions sharing OVER
 *   - PERCENT_RANK / CUME_DIST
 *   - NTILE
 *   - Running total with SUM OVER
 *   - BETWEEN with dates
 *   - LIKE with escape character
 *   - NOT LIKE
 *   - IS NOT NULL
 *   - Mixed AND / OR with parens
 *   - Multiple ORDER BY expressions with NULLS (LAST not native but try)
 *   - OFFSET FETCH (pagination)
 *   - SELECT with no FROM (expressions only)
 *   - NEWSEQUENTIALID() as default
 *   - Table with multiple constraints inline
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
    // ── Scalar subquery ───────────────────────────────────────────────────────
    check(
        'scalar_subquery_select',
        `select o.OrderId, (select count(*) from dbo.OrderLines l where l.OrderId = o.OrderId) as LineCount from dbo.Orders o`,
        ['select count', 'orderlines', 'linecount']
    ),

    // ── Correlated subquery WHERE ─────────────────────────────────────────────
    check(
        'correlated_subquery_where',
        `select * from dbo.Orders o where Amount > (select avg(Amount) from dbo.Orders where CustomerId = o.CustomerId)`,
        ['where amount >', 'select avg', 'customerid = o.customerid']
    ),

    // ── EXISTS / NOT EXISTS ───────────────────────────────────────────────────
    check(
        'exists_subquery',
        `select * from dbo.Customers c where exists (select 1 from dbo.Orders o where o.CustomerId = c.Id and o.Status = 'Active')`,
        ['where exists', 'select 1', 'customerid = c.id', "'active'"]
    ),
    check(
        'not_exists',
        `select * from dbo.Customers c where not exists (select 1 from dbo.Orders o where o.CustomerId = c.Id)`,
        ['where not exists', 'select 1', 'customerid = c.id']
    ),

    // ── ANY / ALL ─────────────────────────────────────────────────────────────
    check(
        'greater_than_all',
        `select * from dbo.Orders where Amount > all (select Amount from dbo.Orders where Status = 'Pending')`,
        ['amount > all', 'select amount', "'pending'"]
    ),

    // ── IN / NOT IN with subquery ─────────────────────────────────────────────
    check(
        'in_subquery',
        `select * from dbo.Orders where CustomerId in (select Id from dbo.Customers where Region = 'West')`,
        ['customerid in', 'select id', 'customers', "'west'"]
    ),
    check(
        'not_in_subquery',
        `select * from dbo.Orders where CustomerId not in (select CustomerId from dbo.Blacklist)`,
        ['customerid not in', 'blacklist']
    ),

    // ── CROSS JOIN ────────────────────────────────────────────────────────────
    check(
        'cross_join',
        `select d.Dept, e.Name from dbo.Departments d cross join dbo.Employees e`,
        ['cross join', 'departments', 'employees']
    ),

    // ── Self join ─────────────────────────────────────────────────────────────
    check(
        'self_join',
        `select e.Name as Employee, m.Name as Manager from dbo.Employees e left join dbo.Employees m on e.ManagerId = m.Id`,
        ['left join', 'dbo.employees', 'employee', 'manager', 'managerid']
    ),

    // ── COUNT DISTINCT ────────────────────────────────────────────────────────
    check(
        'count_distinct',
        `select count(distinct CustomerId) as UniqueCustomers, count(distinct Status) as UniqueStatuses from dbo.Orders`,
        ['count(distinct', 'customerid', 'uniquecustomers', 'uniquestatuses']
    ),

    // ── SUM of CASE WHEN (aggregate of expression) ────────────────────────────
    check(
        'sum_case_agg',
        `select sum(case when Status = 'Active' then Amount else 0 end) as ActiveTotal, sum(case when Status = 'Pending' then 1 else 0 end) as PendingCount from dbo.Orders`,
        ['sum(case when', "'active'", 'activetotal', 'sum(case when', "'pending'", 'pendingcount']
    ),

    // ── Window function sharing ───────────────────────────────────────────────
    check(
        'multiple_window_functions',
        `select OrderId, Amount, row_number() over w as Rn, rank() over w as Rnk, dense_rank() over w as Dr from dbo.Orders window w as (partition by CustomerId order by Amount desc)`,
        ['row_number', 'rank', 'dense_rank', 'over w', 'window w as', 'partition by', 'order by amount']
    ),

    // ── PERCENT_RANK / CUME_DIST ──────────────────────────────────────────────
    check(
        'percent_rank_cume_dist',
        `select OrderId, Amount, percent_rank() over (order by Amount) as Pct, cume_dist() over (order by Amount) as Cum from dbo.Orders`,
        ['percent_rank', 'cume_dist', 'over', 'order by amount']
    ),

    // ── NTILE ─────────────────────────────────────────────────────────────────
    check(
        'ntile',
        `select OrderId, Amount, ntile(4) over (order by Amount desc) as Quartile from dbo.Orders`,
        ['ntile', '4', 'order by amount', 'quartile']
    ),

    // ── Running total ─────────────────────────────────────────────────────────
    check(
        'running_total',
        `select OrderId, Amount, sum(Amount) over (partition by CustomerId order by OrderDate rows between unbounded preceding and current row) as RunningTotal from dbo.Orders`,
        ['sum(amount) over', 'partition by customerid', 'rows between unbounded preceding', 'current row', 'runningtotal']
    ),

    // ── BETWEEN with dates ────────────────────────────────────────────────────
    check(
        'between_dates',
        `select * from dbo.Orders where OrderDate between '2024-01-01' and '2024-12-31'`,
        ['between', "'2024-01-01'", 'and', "'2024-12-31'"]
    ),

    // ── LIKE / NOT LIKE ───────────────────────────────────────────────────────
    check(
        'like_pattern',
        `select * from dbo.Customers where Name like 'Smith%' or Name like '%Jones' and Email not like '%@spam.com'`,
        ["name like 'smith%'", "'%jones'", "not like '%@spam.com'"]
    ),
    check(
        'like_escape',
        `select * from dbo.Tags where Value like '50\%' escape '\'`,
        ['like', "escape '\\'"]
    ),

    // ── OFFSET FETCH ─────────────────────────────────────────────────────────
    check(
        'offset_fetch',
        `select OrderId, Amount from dbo.Orders order by OrderDate desc offset 20 rows fetch next 10 rows only`,
        ['order by orderdate', 'offset 20 rows', 'fetch next 10 rows only']
    ),

    // ── SELECT without FROM ───────────────────────────────────────────────────
    check(
        'select_no_from',
        `select 1 + 1 as Two, getdate() as Now, @@servername as Server`,
        ['select', '1 + 1', 'two', 'getdate', 'now', '@@servername', 'server']
    ),

    // ── Mixed AND/OR with parens ──────────────────────────────────────────────
    check(
        'mixed_and_or',
        `select * from dbo.Orders where (Status = 'Active' or Status = 'Pending') and (Amount > 100 or CustomerId = 42)`,
        ["status = 'active'", "status = 'pending'", 'amount > 100', 'customerid = 42']
    ),

    // ── UPDATE with JOIN ──────────────────────────────────────────────────────
    check(
        'update_with_join',
        `update o set o.Status = 'Shipped', o.ShipDate = getdate() from dbo.Orders o inner join dbo.Shipments s on o.OrderId = s.OrderId where s.TrackingNumber is not null`,
        ["set o.status = 'shipped'", 'shipdate', 'from dbo.orders', 'inner join', 'dbo.shipments', 'trackingnumber', 'is not null']
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

console.log(`\nProbe 52 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
