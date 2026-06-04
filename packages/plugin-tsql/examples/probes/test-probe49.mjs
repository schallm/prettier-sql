/**
 * Probe 49 — Procedural: complex WHILE, nested IF/ELSE, TRY/CATCH patterns,
 *   error handling, GOTO, WAITFOR, BREAK/CONTINUE, RETURN values,
 *   cursor variants (FORWARD_ONLY, DYNAMIC, KEYSET, STATIC),
 *   DECLARE multiple variables in one statement,
 *   SELECT @var = col FROM (assignment SELECT),
 *   table variables with DML,
 *   EXEC with multiple named params,
 *   output parameters in EXEC,
 *   dynamic SQL with sp_executesql,
 *   PRINT with CAST/CONVERT expressions,
 *   nested BEGIN/END blocks,
 *   complex CASE WHEN in UPDATE SET,
 *   WHILE with BREAK and CONTINUE,
 *   TRY_CAST / TRY_CONVERT,
 *   IIF nested,
 *   CHOOSE function,
 *   NULLIF / COALESCE chains,
 *   ERROR_NUMBER / ERROR_MESSAGE / ERROR_SEVERITY / ERROR_STATE / ERROR_LINE
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
    // ── DECLARE multiple variables ────────────────────────────────────────────
    check(
        'declare_multi',
        `declare @a int = 1, @b nvarchar(50) = N'hello', @c decimal(18,2) = 3.14`,
        ['declare @a int', '@b nvarchar', '@c decimal', '3.14', 'hello']
    ),

    // ── SELECT assignment ─────────────────────────────────────────────────────
    check(
        'select_assignment',
        `declare @total decimal(18,2); select @total = sum(Amount) from dbo.Orders where CustomerId = 42`,
        ['select @total = sum', 'from dbo.orders', 'customerid', '42']
    ),

    // ── Table variable DML ────────────────────────────────────────────────────
    check(
        'table_var_dml',
        `declare @t table (Id int, Name nvarchar(100)); insert into @t values (1, 'Alice'), (2, 'Bob'); select * from @t where Id > 0`,
        ['declare @t table', 'insert into @t', 'select * from @t', "'alice'", "'bob'"]
    ),

    // ── WHILE with BREAK / CONTINUE ───────────────────────────────────────────
    check(
        'while_break_continue',
        `declare @i int = 0; while @i < 100 begin set @i = @i + 1; if @i % 10 = 0 continue; if @i > 50 break end`,
        ['while', '@i < 100', 'begin', 'set @i', 'continue', 'break', 'end']
    ),

    // ── GOTO ─────────────────────────────────────────────────────────────────
    check(
        'goto_label',
        `begin declare @n int = 0; StartLoop: set @n = @n + 1; if @n < 10 goto StartLoop; print @n end`,
        ['declare @n', 'startloop:', 'goto startloop', 'print @n']
    ),

    // ── WAITFOR DELAY / TIME ──────────────────────────────────────────────────
    check(
        'waitfor_delay',
        `waitfor delay '00:00:05'`,
        ['waitfor delay', '00:00:05']
    ),
    check(
        'waitfor_time',
        `waitfor time '23:59:00'`,
        ['waitfor time', '23:59:00']
    ),

    // ── TRY/CATCH with full error info ────────────────────────────────────────
    check(
        'trycatch_full',
        `begin try begin transaction; insert into dbo.Orders (CustomerId, Amount) values (@cid, @amt); commit transaction end try begin catch if @@trancount > 0 rollback transaction; declare @err nvarchar(4000) = error_message(); declare @sev int = error_severity(); raiserror(@err, @sev, 1) end catch`,
        ['begin try', 'begin transaction', 'commit transaction', 'begin catch', 'rollback transaction', 'error_message', 'error_severity', 'raiserror']
    ),

    // ── Nested IF/ELSE ────────────────────────────────────────────────────────
    check(
        'nested_if_else',
        `if @status = 'Active' begin if @amount > 1000 set @tier = 'Gold' else set @tier = 'Silver' end else set @tier = 'None'`,
        ['if @status', "'active'", 'begin', '@amount > 1000', "'gold'", "'silver'", 'else', "'none'"]
    ),

    // ── Nested BEGIN/END ──────────────────────────────────────────────────────
    check(
        'nested_begin_end',
        `begin begin begin print 'innermost' end end end`,
        ['begin', 'print', "'innermost'", 'end']
    ),

    // ── TRY_CAST / TRY_CONVERT ───────────────────────────────────────────────
    check(
        'try_cast_convert',
        `select try_cast('123' as int), try_cast(UserInput as decimal(18,2)), try_convert(datetime2, '2024-01-15 12:00:00', 120)`,
        ['try_cast', 'try_convert', 'decimal', 'datetime2', '120']
    ),

    // ── CHOOSE ───────────────────────────────────────────────────────────────
    check(
        'choose_function',
        `select choose(DayOfWeek, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun') as DayName from dbo.Calendar`,
        ['choose', 'dayofweek', "'mon'", "'tue'", "'wed'", 'dayname']
    ),

    // ── NULLIF / COALESCE chain ───────────────────────────────────────────────
    check(
        'nullif_coalesce',
        `select coalesce(nullif(Phone, ''), nullif(AltPhone, ''), 'N/A') as ContactPhone from dbo.Customers`,
        ['coalesce', 'nullif', 'phone', "''", 'altphone', "'n/a'", 'contactphone']
    ),

    // ── ERROR_* functions ─────────────────────────────────────────────────────
    check(
        'error_functions',
        `begin catch select error_number() as ErrNum, error_message() as ErrMsg, error_severity() as ErrSev, error_state() as ErrState, error_line() as ErrLine, error_procedure() as ErrProc end catch`,
        ['error_number', 'error_message', 'error_severity', 'error_state', 'error_line', 'error_procedure']
    ),

    // ── Complex CASE in UPDATE SET ────────────────────────────────────────────
    check(
        'update_set_case',
        `update dbo.Orders set Status = case when Amount > 10000 then 'VIP' when Amount > 1000 then 'Priority' when Amount > 0 then 'Standard' else 'Invalid' end, Tier = case when DaysOld < 7 then 'New' when DaysOld < 30 then 'Recent' else 'Old' end where CustomerId = @cid`,
        ['update', 'set status = case', 'when amount > 10000', "'vip'", 'when amount > 1000', "'priority'", 'tier = case', 'daysold', "'new'", "'recent'", 'where customerid']
    ),

    // ── EXEC named params ─────────────────────────────────────────────────────
    check(
        'exec_named_params',
        `exec dbo.GetOrderSummary @CustomerId = 42, @StartDate = '2024-01-01', @EndDate = '2024-12-31', @IncludeDetails = 1`,
        ['exec', 'getordersummary', '@customerid = 42', '@startdate', '2024-01-01', '@enddate', '2024-12-31', '@includedetails = 1']
    ),

    // ── EXEC with OUTPUT param ────────────────────────────────────────────────
    check(
        'exec_output_param',
        `declare @cnt int; exec dbo.GetCount @TableName = 'Orders', @RowCount = @cnt output; print @cnt`,
        ['exec', 'getcounts', '@tablename', "'orders'", '@rowcount', '@cnt', 'output', 'print @cnt']
    ),

    // ── Cursor variants ───────────────────────────────────────────────────────
    check(
        'cursor_dynamic',
        `declare cur cursor dynamic for select OrderId from dbo.Orders where Status = 'Pending'`,
        ['cursor', 'dynamic', 'select orderid', 'status', "'pending'"]
    ),
    check(
        'cursor_static',
        `declare cur cursor static read_only forward_only for select OrderId, Amount from dbo.Orders`,
        ['cursor', 'static', 'read_only', 'forward_only']
    ),
    check(
        'cursor_keyset',
        `declare cur cursor keyset scroll for select OrderId, Amount from dbo.Orders order by OrderId`,
        ['cursor', 'keyset', 'scroll', 'order by orderid']
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

console.log(`\nProbe 49 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
