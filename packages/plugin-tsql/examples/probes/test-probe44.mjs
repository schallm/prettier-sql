/**
 * Probe 44 — Transactions, INSERT EXEC, special clauses:
 *   - COMMIT WORK / ROLLBACK WORK (aliases for COMMIT/ROLLBACK TRANSACTION)
 *   - INSERT ... EXEC (insert from stored procedure result)
 *   - INSERT ... EXEC ('dynamic sql')
 *   - SELECT ... INTO existing temp table
 *   - READTEXT / WRITETEXT (deprecated)
 *   - TEXTPTR / TEXTVALID
 *   - Multiple WITH hints on same table (WITH (NOLOCK, ROWLOCK))
 *   - Derived table with ORDER BY and TOP
 *   - EXCEPT / INTERSECT with ORDER BY
 *   - CTE with multiple output columns
 *   - UNION with different column names
 *   - UNION ALL with 3+ selects
 *   - FULL TEXT: CONTAINS / FREETEXT / CONTAINSTABLE / FREETEXTTABLE
 *   - CHARINDEX with start_position
 *   - LEFT / RIGHT (string functions)
 *   - REVERSE / UPPER / LOWER
 *   - QUOTENAME / PARSENAME
 *   - DB_ID() / DB_NAME()
 *   - HOST_NAME() / APP_NAME()
 *   - IS_MEMBER() / IS_ROLEMEMBER()
 *   - SYSDATETIME / SYSDATETIMEOFFSET / SYSUTCDATETIME
 *   - GETDATE / GETUTCDATE
 *   - CURRENT_TIMESTAMP / CURRENT_USER / SYSTEM_USER / SESSION_USER
 *   - TRY_PARSE with culture
 *   - PARSE with culture
 *   - DATETIMEOFFSETFROMPARTS
 *   - TIMEFROMPARTS
 *   - CONVERT with style 120 (ISO 8601)
 *   - SWITCHOFFSET
 *   - TODATETIMEOFFSET
 *   - AT TIME ZONE (both conversions)
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
    // ── COMMIT / ROLLBACK WORK ────────────────────────────────────────────────
    check(
        'commit_work',
        `begin transaction; insert into dbo.Orders (Amount) values (100); commit work`,
        ['begin transaction', 'commit', 'work']
    ),
    check(
        'rollback_work',
        `begin transaction; insert into dbo.Orders (Amount) values (100); rollback work`,
        ['begin transaction', 'rollback', 'work']
    ),

    // ── INSERT EXEC ───────────────────────────────────────────────────────────
    check(
        'insert_exec_proc',
        `insert into #Results exec dbo.GetActiveOrders @CustomerId = 42`,
        ['insert into', '#results', 'exec', 'dbo.getactiveorders', '@customerid', '42']
    ),
    check(
        'insert_exec_sql',
        `insert into #Results exec('select * from dbo.Orders where Status = ''Active''')`,
        ['insert into', '#results', 'exec', 'select', 'orders', 'status', 'active']
    ),

    // ── UNION ALL with 3 selects ──────────────────────────────────────────────
    check(
        'union_all_three',
        `select 'Pending' as Status, count(*) as Cnt from dbo.Orders where Status = 'Pending' union all select 'Active', count(*) from dbo.Orders where Status = 'Active' union all select 'Closed', count(*) from dbo.Orders where Status = 'Closed'`,
        ['union all', 'pending', 'active', 'closed', 'count']
    ),

    // ── EXCEPT / INTERSECT with ORDER BY ─────────────────────────────────────
    check(
        'except_with_order_by',
        `select CustomerId from dbo.Orders except select CustomerId from dbo.Blacklist order by CustomerId`,
        ['except', 'blacklist', 'order by', 'customerid']
    ),

    // ── Derived table with TOP + ORDER BY ─────────────────────────────────────
    check(
        'derived_top_order_by',
        `select * from (select top 10 OrderId, Amount from dbo.Orders order by Amount desc) t order by OrderId`,
        ['top', '10', 'order by amount', 'desc', 'order by orderid']
    ),

    // ── String functions ──────────────────────────────────────────────────────
    check(
        'left_right_reverse',
        `select left(Name, 3), right(Name, 3), reverse(Name), upper(Name), lower(Name) from dbo.Customers`,
        ['left', 'right', 'reverse', 'upper', 'lower', 'name']
    ),
    check(
        'quotename_parsename',
        `select quotename(Name), parsename('server.db.schema.table', 1), parsename('server.db.schema.table', 4)`,
        ['quotename', 'parsename', 'server.db.schema.table', '1', '4']
    ),
    check(
        'charindex_start',
        `select charindex('@', Email, 1), charindex('.', Email, charindex('@', Email)) from dbo.Customers`,
        ['charindex', '@', 'email', '1', '.']
    ),

    // ── System info functions ─────────────────────────────────────────────────
    check(
        'system_info',
        `select db_id(), db_name(), host_name(), app_name(), current_user, system_user, session_user`,
        ['db_id', 'db_name', 'host_name', 'app_name', 'current_user', 'system_user', 'session_user']
    ),
    check(
        'datetime_functions',
        `select sysdatetime(), sysdatetimeoffset(), sysutcdatetime(), getdate(), getutcdate(), current_timestamp`,
        ['sysdatetime', 'sysdatetimeoffset', 'sysutcdatetime', 'getdate', 'getutcdate', 'current_timestamp']
    ),

    // ── CONVERT with style ────────────────────────────────────────────────────
    check(
        'convert_style',
        `select convert(varchar(10), OrderDate, 120), convert(nvarchar(30), getdate(), 126) from dbo.Orders`,
        ['convert', 'varchar', 'orderdate', '120', 'nvarchar', '126']
    ),

    // ── TRY_PARSE / PARSE ─────────────────────────────────────────────────────
    check(
        'try_parse',
        `select try_parse('2024-01-15' as date using 'en-US'), parse('15,000.50' as decimal(12,2) using 'en-US')`,
        ['try_parse', 'parse', '2024-01-15', 'as date', 'decimal', 'en-us']
    ),

    // ── SWITCHOFFSET / TODATETIMEOFFSET ───────────────────────────────────────
    check(
        'switchoffset_todatetimeoffset',
        `select switchoffset(sysdatetimeoffset(), '-05:00'), todatetimeoffset(getdate(), '-05:00')`,
        ['switchoffset', 'sysdatetimeoffset', '-05:00', 'todatetimeoffset', 'getdate']
    ),

    // ── Multiple table hints ──────────────────────────────────────────────────
    check(
        'multiple_hints',
        `select * from dbo.Orders with (nolock, rowlock) join dbo.Customers with (nolock) on Orders.CustomerId = Customers.Id`,
        ['with (nolock, rowlock)', 'customers', 'nolock', 'on']
    ),

    // ── FULL TEXT search ──────────────────────────────────────────────────────
    check(
        'contains',
        `select * from dbo.Products where contains(Description, '"SQL Server" and "Database"')`,
        ['contains', 'description', 'sql server', 'database']
    ),
    check(
        'freetext',
        `select * from dbo.Articles where freetext(Content, 'database performance tuning')`,
        ['freetext', 'content', 'database performance tuning']
    ),

    // ── IS_MEMBER / IS_ROLEMEMBER ─────────────────────────────────────────────
    check(
        'is_member',
        `select case when is_member('db_owner') = 1 then 'Owner' when is_rolemember('ReportViewers') = 1 then 'Reporter' else 'User' end as Role`,
        ['is_member', 'db_owner', 'is_rolemember', 'reportviewers', 'reporter']
    ),

    // ── DATETIMEOFFSETFROMPARTS / TIMEFROMPARTS ───────────────────────────────
    check(
        'datetimeoffsetfromparts',
        `select datetimeoffsetfromparts(2024, 1, 15, 12, 30, 0, 0, -5, 0, 0), timefromparts(12, 30, 0, 0, 0)`,
        ['datetimeoffsetfromparts', '2024', '12', '30', 'timefromparts']
    ),

    // ── CTE with many columns ─────────────────────────────────────────────────
    check(
        'cte_many_columns',
        `with Summary (CustomerId, OrderCount, TotalAmount, AvgAmount, MinDate, MaxDate, LastStatus) as (select CustomerId, count(*), sum(Amount), avg(Amount), min(OrderDate), max(OrderDate), max(Status) from dbo.Orders group by CustomerId) select * from Summary where OrderCount > 5`,
        ['summary', 'customerid', 'ordercount', 'totalamount', 'avgamount', 'mindate', 'maxdate', 'laststatus', 'count', 'sum', 'avg', 'min', 'max', 'group by']
    ),

    // ── CURRENT_TIMESTAMP ─────────────────────────────────────────────────────
    check(
        'current_timestamp',
        `insert into dbo.Audit (EventDate, Event) values (current_timestamp, 'Login')`,
        ['current_timestamp', 'login', 'eventdate']
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

console.log(`\nProbe 44 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
