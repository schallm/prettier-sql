/**
 * Probe 40 — Expression and function edge cases:
 *   - Arithmetic: +, -, *, /, % with proper precedence
 *   - String concatenation: + operator with NULLs
 *   - Bitwise: &, |, ^, ~
 *   - Unary minus / NOT
 *   - BETWEEN / NOT BETWEEN
 *   - LIKE / NOT LIKE with wildcards
 *   - IS NULL / IS NOT NULL
 *   - COLLATE clause in expression
 *   - AT TIME ZONE
 *   - SWITCHOFFSET / TODATETIMEOFFSET
 *   - FORMAT function
 *   - PARSE / TRY_PARSE
 *   - EOMONTH / DATEFROMPARTS / DATETIMEFROMPARTS
 *   - STRING_SPLIT / TRIM / LTRIM / RTRIM
 *   - CONCAT / CONCAT_WS
 *   - TRANSLATE / UNICODE / CHAR / ASCII / NCHAR
 *   - PATINDEX / REPLICATE
 *   - FLOOR / CEILING / ROUND / ABS / SIGN / POWER / SQRT / LOG / EXP
 *   - RAND / CHECKSUM_AGG / STDEV / VAR / STDEVP / VARP
 *   - GROUPING / GROUPING_ID
 *   - RANK / DENSE_RANK with complex partitions
 *   - CUME_DIST / PERCENT_RANK / PERCENTILE_CONT / PERCENTILE_DISC
 *   - FIRST_VALUE / LAST_VALUE
 *   - SUM / COUNT / MAX / MIN / AVG over window
 *   - ROWS BETWEEN / RANGE BETWEEN in OVER clause
 *   - UNBOUNDED PRECEDING / CURRENT ROW / UNBOUNDED FOLLOWING
 *   - OVER with PARTITION BY and ORDER BY
 *   - Subquery in CASE WHEN
 *   - Nested CASE
 *   - NULLIF in WHERE
 *   - COALESCE with multiple args
 *   - Table-valued function call in FROM
 *   - CROSS APPLY with table-valued function
 *   - Functions with schema prefix (dbo.fn_X)
 *   - @@SPID / @@VERSION / @@SERVERNAME
 *   - OBJECT_ID / OBJECT_NAME / SCHEMA_ID / SCHEMA_NAME
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
    // ── Arithmetic / bitwise ──────────────────────────────────────────────────
    check(
        'arithmetic',
        `select (a + b) * c / d - e % f from T`,
        ['a + b', '* c', '/ d', '- e', '% f']
    ),
    check(
        'bitwise',
        `select a & b, a | b, a ^ b, ~a from T`,
        ['a & b', 'a | b', 'a ^ b', '~a']
    ),
    check(
        'unary_negative',
        `select -Amount, not Active from dbo.Orders`,
        ['-amount', 'not', 'active']
    ),

    // ── Predicates ───────────────────────────────────────────────────────────
    check(
        'between',
        `select * from dbo.Orders where Amount between 100 and 1000`,
        ['between', '100', 'and', '1000']
    ),
    check(
        'not_between',
        `select * from dbo.Orders where Amount not between 100 and 1000`,
        ['not between', '100', '1000']
    ),
    check(
        'like_wildcards',
        `select * from dbo.Customers where Name like '%Smith%' and Email not like '%@spam.%'`,
        ['like', 'smith', 'not like', 'spam']
    ),
    check(
        'is_null_is_not_null',
        `select * from dbo.Orders where Notes is null or ShipDate is not null`,
        ['is null', 'is not null', 'notes', 'shipdate']
    ),

    // ── AT TIME ZONE ─────────────────────────────────────────────────────────
    check(
        'at_time_zone',
        `select OrderDate at time zone 'UTC' at time zone 'Eastern Standard Time' from dbo.Orders`,
        ['at time zone', 'utc', 'eastern standard time']
    ),

    // ── Date / time functions ─────────────────────────────────────────────────
    check(
        'eomonth',
        `select eomonth(getdate()), eomonth(getdate(), 1)`,
        ['eomonth', 'getdate']
    ),
    check(
        'datefromparts',
        `select datefromparts(2024, 1, 15), datetimefromparts(2024, 1, 15, 12, 0, 0, 0)`,
        ['datefromparts', '2024', '1', '15', 'datetimefromparts', '12', '0']
    ),
    check(
        'format_function',
        `select format(OrderDate, 'yyyy-MM-dd', 'en-US') from dbo.Orders`,
        ['format', 'yyyy-mm-dd', 'en-us']
    ),

    // ── String functions ──────────────────────────────────────────────────────
    check(
        'concat_ws',
        `select concat_ws(', ', FirstName, MiddleName, LastName) from dbo.Customers`,
        ['concat_ws', 'firstname', 'middlename', 'lastname']
    ),
    check(
        'trim_functions',
        `select trim(' ' from Name), ltrim(Name), rtrim(Name) from dbo.Customers`,
        ['trim', 'ltrim', 'rtrim', 'name']
    ),
    check(
        'translate',
        `select translate(Name, 'aeiou', '12345') from dbo.Customers`,
        ['translate', '12345']
    ),
    check(
        'replicate_patindex',
        `select replicate('X', 10), patindex('%[0-9]%', Name) from dbo.Customers`,
        ['replicate', 'patindex', '0-9']
    ),
    check(
        'string_split',
        `select value from string_split('a,b,c', ',')`,
        ['string_split', 'a,b,c', 'value']
    ),

    // ── Math functions ────────────────────────────────────────────────────────
    check(
        'math_functions',
        `select floor(3.7), ceiling(3.2), round(3.456, 2), abs(-5), sign(-3), power(2, 10), sqrt(144.0), log(2.718), exp(1) from dbo.Dummy`,
        ['floor', 'ceiling', 'round', 'abs', 'sign', 'power', 'sqrt', 'log', 'exp']
    ),

    // ── Aggregate functions ───────────────────────────────────────────────────
    check(
        'aggregate_functions',
        `select stdev(Amount), var(Amount), stdevp(Amount), varp(Amount), checksum_agg(distinct Amount) from dbo.Orders`,
        ['stdev', 'var', 'stdevp', 'varp', 'checksum_agg', 'distinct']
    ),

    // ── GROUPING / GROUPING_ID ────────────────────────────────────────────────
    check(
        'grouping_id',
        `select Country, Region, sum(Sales), grouping(Country), grouping(Region), grouping_id(Country, Region) from dbo.Sales group by rollup(Country, Region)`,
        ['grouping', 'grouping_id', 'country', 'region', 'rollup']
    ),

    // ── Window functions with frames ──────────────────────────────────────────
    check(
        'window_rows_between',
        `select OrderId, Amount, sum(Amount) over (order by OrderDate rows between 2 preceding and current row) as RunningSum from dbo.Orders`,
        ['sum', 'over', 'rows between', '2 preceding', 'current row', 'runningsum']
    ),
    check(
        'window_range_unbounded',
        `select OrderId, Amount, sum(Amount) over (partition by CustomerId order by OrderDate range between unbounded preceding and unbounded following) as CustTotal from dbo.Orders`,
        ['range between', 'unbounded preceding', 'unbounded following', 'custtotal']
    ),
    check(
        'cume_dist',
        `select OrderId, Amount, cume_dist() over (order by Amount) as CumeDist, percent_rank() over (order by Amount) as PctRank from dbo.Orders`,
        ['cume_dist', 'percent_rank', 'cumedist', 'pctrank']
    ),
    check(
        'first_last_value',
        `select OrderId, Amount, first_value(Amount) over (partition by CustomerId order by OrderDate) as FirstOrder, last_value(Amount) over (partition by CustomerId order by OrderDate rows between unbounded preceding and unbounded following) as LastOrder from dbo.Orders`,
        ['first_value', 'last_value', 'firstorder', 'lastorder']
    ),

    // ── System functions ──────────────────────────────────────────────────────
    check(
        'system_functions',
        `select @@spid, @@version, @@servername, object_id('dbo.Orders'), object_name(12345), schema_id('dbo'), schema_name(1)`,
        ['@@spid', '@@version', '@@servername', 'object_id', 'object_name', 'schema_id', 'schema_name']
    ),

    // ── Table-valued functions in FROM ────────────────────────────────────────
    check(
        'tvf_in_from',
        `select * from dbo.fn_GetOrdersByCustomer(@customerId) where Amount > 100`,
        ['fn_getordersbycustomer', '@customerid', 'where', 'amount', '100']
    ),
    check(
        'tvf_cross_apply',
        `select o.OrderId, items.ProductId, items.Qty from dbo.Orders o cross apply dbo.fn_GetOrderItems(o.OrderId) items`,
        ['cross apply', 'fn_getorderitems', 'orderid', 'items', 'productid', 'qty']
    ),

    // ── COLLATE ───────────────────────────────────────────────────────────────
    check(
        'collate_expr',
        `select * from dbo.Customers where Name collate Latin1_General_CS_AS = @name collate Latin1_General_CS_AS`,
        ['collate', 'latin1_general_cs_as', 'name', '@name']
    ),

    // ── OBJECT_ID check pattern ───────────────────────────────────────────────
    check(
        'object_id_check',
        `if object_id('dbo.TempResults', 'U') is not null drop table dbo.TempResults`,
        ['object_id', 'dbo.tempresults', 'u', 'is not null', 'drop table']
    ),

    // ── Nested CASE / CASE in CASE ────────────────────────────────────────────
    check(
        'nested_case',
        `select case when Amount > 1000 then case when CustomerId > 100 then 'Premium Large' else 'Standard Large' end else 'Small' end as Category from dbo.Orders`,
        ['case when amount', 'case when customerid', 'premium large', 'standard large', 'small', 'category']
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

console.log(`\nProbe 40 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
