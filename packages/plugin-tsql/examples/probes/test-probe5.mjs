/**
 * Fifth semantic-safety probe — window functions, GROUP BY extensions,
 * subqueries, and miscellaneous data-loss candidates.
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

// ── LEAD / LAG with offset and default ───────────────────────────────────
await t('lead_function',
    `select lead(Amount, 2, 0) over (partition by CustId order by OrderDate) from dbo.Orders;`,
    ['lead(Amount, 2, 0)', 'partition by CustId']);

await t('lag_function',
    `select lag(Price, 1, null) over (order by Date) from dbo.Prices;`,
    ['lag(Price, 1, null)', 'order by Date']);

// ── FIRST_VALUE / LAST_VALUE ─────────────────────────────────────────────
await t('first_value',
    `select first_value(Amount) over (partition by CustId order by OrderDate rows between unbounded preceding and current row) from dbo.Orders;`,
    ['first_value(Amount)', 'unbounded preceding', 'current row']);

// ── PERCENTILE_CONT / PERCENTILE_DISC ────────────────────────────────────
await t('percentile_cont',
    `select percentile_cont(0.5) within group (order by Salary) over (partition by Dept) from dbo.Employees;`,
    ['percentile_cont(0.5)', 'within group', 'order by Salary', 'partition by Dept']);

// ── NTILE ────────────────────────────────────────────────────────────────
await t('ntile_function',
    `select ntile(4) over (order by Amount desc) as Quartile from dbo.Orders;`,
    ['ntile(4)', 'order by Amount desc', 'Quartile']);

// ── CUME_DIST / PERCENT_RANK ──────────────────────────────────────────────
await t('cume_dist',
    `select cume_dist() over (partition by Dept order by Salary) from dbo.Employees;`,
    ['cume_dist()', 'partition by Dept']);

// ── GROUP BY ROLLUP ───────────────────────────────────────────────────────
await t('group_by_rollup',
    `select Region, Country, sum(Sales) from dbo.Sales group by rollup(Region, Country);`,
    ['group by rollup', 'Region, Country']);

// ── GROUP BY CUBE ─────────────────────────────────────────────────────────
await t('group_by_cube',
    `select Region, Country, sum(Sales) from dbo.Sales group by cube(Region, Country);`,
    ['group by cube', 'Region, Country']);

// ── GROUPING SETS ─────────────────────────────────────────────────────────
await t('grouping_sets',
    `select Region, Country, City, sum(Sales)
     from dbo.Sales
     group by grouping sets ((Region, Country), (Country), ());`,
    ['grouping sets', '(Region, Country)', '(Country)', '()']);

// ── GROUPING() and GROUPING_ID() ─────────────────────────────────────────
await t('grouping_function',
    `select Region, grouping(Region) as IsTotal, sum(Sales) from dbo.Sales group by rollup(Region);`,
    ['grouping(Region)', 'IsTotal']);

// ── CONVERT with style ────────────────────────────────────────────────────
await t('convert_with_style',
    `select convert(varchar(10), OrderDate, 101) from dbo.Orders;`,
    ['convert', 'varchar(10)', 'OrderDate', '101']);

// ── TRY_CONVERT with type ─────────────────────────────────────────────────
await t('try_convert_type',
    `select try_convert(decimal(10,2), '123.45');`,
    ['try_convert', 'decimal(10,2)', "'123.45'"]);

// ── INSERT multi-row VALUES ───────────────────────────────────────────────
await t('insert_multirow',
    `insert into dbo.T (A, B) values (1, 'x'), (2, 'y'), (3, 'z');`,
    ["(1, 'x')", "(2, 'y')", "(3, 'z')"]);

// ── UPDATE with assignment to variable ───────────────────────────────────
await t('update_assign_var',
    `update dbo.Queue set @Id = Id, IsProcessed = 1 where IsProcessed = 0;`,
    ['@Id = Id', 'IsProcessed = 1']);

// ── Subquery in SELECT ────────────────────────────────────────────────────
await t('scalar_subquery',
    `select Id, (select max(Amount) from dbo.Orders o2 where o2.CustId = o.CustId) as MaxAmt from dbo.Orders o;`,
    ['select max(Amount)', 'MaxAmt']);

// ── Derived table in FROM ─────────────────────────────────────────────────
await t('derived_table',
    `select dt.Id, dt.Total from (select CustId as Id, sum(Amount) as Total from dbo.Orders group by CustId) as dt;`,
    ['sum(Amount) as Total', 'group by CustId']);

// ── COLLATE on expression ─────────────────────────────────────────────────
await t('collate_expression',
    `select * from dbo.Products where Name collate Latin1_General_BIN = @name;`,
    ['collate Latin1_General_BIN']);

// ── CASE expression: no ELSE ──────────────────────────────────────────────
await t('case_no_else',
    `select case when Status = 1 then 'Active' when Status = 2 then 'Inactive' end from dbo.T;`,
    ["'Active'", "'Inactive'"]);
// confirm no phantom ELSE NULL appears
    
// ── COALESCE / NULLIF ─────────────────────────────────────────────────────
await t('coalesce_nullif',
    `select coalesce(NullableCol, nullif(DefaultCol, ''), 'fallback') from dbo.T;`,
    ['coalesce(NullableCol', "nullif(DefaultCol, '')", "'fallback'"]);

// ── GOTO / label ──────────────────────────────────────────────────────────
await t('goto_label',
    `begin
        goto MyLabel;
        select 'skipped';
        MyLabel:
        select 'reached';
     end;`,
    ['goto MyLabel', 'MyLabel:']);

// ── NEXT VALUE FOR sequence ───────────────────────────────────────────────
await t('next_value_for',
    `select next value for dbo.MySeq as NextId;`,
    ['next value for', 'dbo.MySeq', 'NextId']);

// ── MULTIPLE CTEs ─────────────────────────────────────────────────────────
await t('multiple_ctes',
    `with A as (select Id from dbo.T1),
          B as (select Id from dbo.T2)
     select a.Id, b.Id from A a join B b on a.Id = b.Id;`,
    ['with A as', 'B as', 'from A', 'join B']);

// ── BINARY literal ────────────────────────────────────────────────────────
await t('binary_literal',
    `select * from dbo.T where Hash = 0xDEADBEEF;`,
    ['0xDEADBEEF']);

// ── varchar(max) / nvarchar(max) ──────────────────────────────────────────
await t('varchar_max',
    `create table dbo.T (Id int, Body varchar(max), Data varbinary(max));`,
    ['varchar(max)', 'varbinary(max)']);

// ── money type ────────────────────────────────────────────────────────────
await t('money_type',
    `declare @price money = $1.99; declare @small smallmoney = $0.50;`,
    ['money', 'smallmoney', '$1.99', '$0.50']);

// ── EXEC with OUTPUT parameter ────────────────────────────────────────────
await t('exec_output_param',
    `declare @result int; exec dbo.usp_Calc @Input = 5, @Result = @result output; select @result;`,
    ['@Result = @result output', '@result']);

// ── OPENQUERY ─────────────────────────────────────────────────────────────
await t('openquery',
    `select * from openquery(LinkedServer, 'select 1 as N');`,
    ['openquery', 'LinkedServer', "'select 1 as N'"]);

// ── Subquery in WHERE with IN ─────────────────────────────────────────────
await t('in_subquery',
    `select * from dbo.Orders where CustId in (select Id from dbo.Customers where IsActive = 1);`,
    // formatter wraps subquery — check semantics not layout
    ['CustId in', 'select Id', 'IsActive = 1']);

// ── EXISTS predicate ──────────────────────────────────────────────────────
await t('exists_predicate',
    `select * from dbo.Orders o where exists (select 1 from dbo.Returns r where r.OrderId = o.Id);`,
    ['exists', 'r.OrderId = o.Id']);

// ── ALL / ANY / SOME ─────────────────────────────────────────────────────
await t('all_subquery',
    `select * from dbo.T where Val > all (select Val from dbo.Baseline);`,
    ['> all', 'select Val']);

// ── CASE in ORDER BY ─────────────────────────────────────────────────────
await t('case_in_order_by',
    `select Id from dbo.T order by case when Status = 1 then 0 else 1 end, Id;`,
    ['case when Status = 1 then 0 else 1 end', 'order by']);

// ── Global variables ─────────────────────────────────────────────────────
await t('global_variables',
    `select @@rowcount, @@error, @@identity, @@servername;`,
    ['@@rowcount', '@@error', '@@identity', '@@servername']);

// ── NULL comparison ───────────────────────────────────────────────────────
await t('is_null',
    `select * from dbo.T where A is null and B is not null;`,
    ['is null', 'is not null']);

// ── Nested CASE ───────────────────────────────────────────────────────────
await t('nested_case',
    `select case when A = 1 then case when B = 2 then 'AB' else 'A' end else 'none' end from dbo.T;`,
    ["case when B = 2 then 'AB' else 'A' end", "'none'"]);

// ── HAVING with aggregate ─────────────────────────────────────────────────
await t('having_clause',
    `select CustId, count(*) as Orders from dbo.Orders group by CustId having count(*) > 10;`,
    ['having', 'count(*) > 10']);

// ── DISTINCT ─────────────────────────────────────────────────────────────
await t('select_distinct',
    `select distinct Region, Country from dbo.Sales;`,
    ['select distinct', 'Region', 'Country']);

// ── INSERT with column list from VALUES ──────────────────────────────────
await t('insert_with_cols',
    `insert into dbo.Log (EventDate, EventType, Details) values (getdate(), 'Login', @Details);`,
    ['EventDate, EventType, Details', "getdate(), 'Login'", '@Details']);

console.log(`\n${ok} passed, ${fail} failed`);
