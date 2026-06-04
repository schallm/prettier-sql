/**
 * Probe 43 — Less common statement forms and T-SQL-specific syntax:
 *   - SELECT ... INTO #temp (already tested, passes)
 *   - TRUNCATE TABLE with partitions
 *   - ALTER TABLE REBUILD (online)
 *   - ALTER INDEX ALL ON ... REBUILD
 *   - ALTER INDEX ... REORGANIZE
 *   - WAITFOR (RECEIVE from Service Broker)
 *   - Various SET options
 *   - READTEXT / WRITETEXT / UPDATETEXT (deprecated but parseable?)
 *   - LINESIZE / TEXTSIZE options
 *   - PRINT @variable
 *   - PRINT with message formatting
 *   - SET ROWCOUNT
 *   - SET DATEFORMAT
 *   - SET LANGUAGE
 *   - SET LOCK_TIMEOUT
 *   - SET CONCAT_NULL_YIELDS_NULL
 *   - SET ARITHABORT
 *   - SET ARITHIGNORE
 *   - SET ANSI_NULLS
 *   - SET ANSI_PADDING
 *   - SET QUOTED_IDENTIFIER
 *   - SET IMPLICIT_TRANSACTIONS
 *   - SET STATISTICS IO ON/OFF
 *   - SET STATISTICS TIME ON/OFF
 *   - CREATE PARTITION FUNCTION with multiple boundary values
 *   - CREATE PARTITION SCHEME mapping all to one filegroup
 *   - SELECT with APPLY and TVF
 *   - OPENROWSET with bulk import
 *   - FORMATMESSAGE function
 *   - CONNECTIONPROPERTY function
 *   - CONTEXT_INFO / SET CONTEXT_INFO
 *   - SESSION_CONTEXT
 *   - COLUMNS_UPDATED() / UPDATE() in triggers
 *   - SCOPE_IDENTITY() / @@IDENTITY
 *   - IDENT_CURRENT() / IDENT_INCR() / IDENT_SEED()
 *   - sp_executesql with multiple params
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
    // ── ALTER INDEX ───────────────────────────────────────────────────────────
    check(
        'alter_index_rebuild_all',
        `alter index all on dbo.Orders rebuild with (online = on, fillfactor = 80)`,
        ['alter index', 'all', 'on dbo.orders', 'rebuild', 'online', 'fillfactor', '80']
    ),
    check(
        'alter_index_reorganize',
        `alter index IX_Orders_Date on dbo.Orders reorganize`,
        ['alter index', 'ix_orders_date', 'on dbo.orders', 'reorganize']
    ),
    check(
        'alter_index_disable',
        `alter index IX_Orders_Date on dbo.Orders disable`,
        ['alter index', 'ix_orders_date', 'disable']
    ),

    // ── SET options ───────────────────────────────────────────────────────────
    check(
        'set_rowcount',
        `set rowcount 100`,
        ['set', 'rowcount', '100']
    ),
    check(
        'set_statistics_io',
        `set statistics io on`,
        ['set statistics io', 'on']
    ),
    check(
        'set_statistics_time',
        `set statistics time on`,
        ['set statistics time', 'on']
    ),
    check(
        'set_ansi_nulls',
        `set ansi_nulls on`,
        ['set', 'ansi_nulls', 'on']
    ),
    check(
        'set_quoted_identifier',
        `set quoted_identifier off`,
        ['set', 'quoted_identifier', 'off']
    ),
    check(
        'set_nocount',
        `set nocount on`,
        ['set', 'nocount', 'on']
    ),

    // ── Partition function/scheme with many values ────────────────────────────
    check(
        'partition_fn_many_values',
        `create partition function OrdersByYear(int) as range left for values (2020, 2021, 2022, 2023, 2024)`,
        ['create partition function', 'ordersbyyear', 'range left', 'values', '2020', '2021', '2022', '2023', '2024']
    ),
    check(
        'partition_scheme_all_one',
        `create partition scheme OrdersByYearScheme as partition OrdersByYear all to ([PRIMARY])`,
        ['create partition scheme', 'ordersbyyearscheme', 'as partition', 'ordersbyyear', 'all to']
    ),

    // ── System functions ──────────────────────────────────────────────────────
    check(
        'scope_identity',
        `insert into dbo.Orders (Amount) values (100); select scope_identity() as NewId`,
        ['insert', 'scope_identity', 'newid']
    ),
    check(
        'ident_functions',
        `select ident_current('dbo.Orders'), ident_incr('dbo.Orders'), ident_seed('dbo.Orders')`,
        ['ident_current', 'ident_incr', 'ident_seed', 'dbo.orders']
    ),
    check(
        'formatmessage',
        `declare @msg nvarchar(2048) = formatmessage(50001, @orderId, @status); print @msg`,
        ['formatmessage', '50001', '@orderid', '@status', 'print', '@msg']
    ),

    // ── CONTEXT_INFO ──────────────────────────────────────────────────────────
    check(
        'set_context_info',
        `declare @ctx varbinary(128) = cast('AppUser:42' as varbinary(128)); set context_info @ctx`,
        ['set context_info', '@ctx', 'varbinary', 'cast', 'appuser:42']
    ),

    // ── sp_executesql with many params ────────────────────────────────────────
    check(
        'sp_executesql_many_params',
        `exec sp_executesql N'select * from dbo.Orders where CustomerId = @cid and Status = @status and Amount > @min', N'@cid int, @status nvarchar(20), @min decimal(18,2)', @cid = 42, @status = N'Active', @min = 100.00`,
        ['sp_executesql', '@cid int', '@status nvarchar', '@min decimal', '@cid = 42', '@status', 'active', '@min = 100.00']
    ),

    // ── SELECT with TVF + APPLY ───────────────────────────────────────────────
    check(
        'apply_tvf',
        `select o.OrderId, i.ProductId, i.Qty from dbo.Orders o cross apply dbo.fn_Items(o.OrderId) i`,
        ['cross apply', 'fn_items', 'orderid', 'productid', 'qty']
    ),

    // ── COLUMNS_UPDATED in trigger ────────────────────────────────────────────
    check(
        'columns_updated',
        `create trigger trgColAudit on dbo.Orders after update as if columns_updated() & 2 > 0 begin insert into dbo.Audit values ('Amount changed') end`,
        ['create trigger', 'after update', 'columns_updated', '& 2', "> 0", 'insert into', 'audit']
    ),

    // ── UPDATE() in trigger ───────────────────────────────────────────────────
    check(
        'update_function_trigger',
        `create trigger trgUpdateAudit on dbo.Orders after update as if update(Status) or update(Amount) begin insert into dbo.ChangeLog select OrderId from inserted end`,
        ['if update(status)', 'or update(amount)', 'inserted']
    ),

    // ── @@FETCH_STATUS / @@CURSOR_ROWS ────────────────────────────────────────
    check(
        'fetch_status_cursor_rows',
        `declare @n int; open MyCursor; set @n = @@cursor_rows; while @@fetch_status = 0 begin fetch next from MyCursor into @id end`,
        ['@@cursor_rows', '@@fetch_status', 'fetch next', 'from mycursor']
    ),

    // ── RETURN in proc ────────────────────────────────────────────────────────
    check(
        'return_from_proc',
        `create procedure dbo.CheckExists @Id int as begin if not exists (select 1 from dbo.Orders where OrderId = @Id) return -1 return 0 end`,
        ['if not exists', 'return -1', 'return 0']
    ),

    // ── EXEC with OUTPUT capture ──────────────────────────────────────────────
    check(
        'exec_output_capture',
        `declare @result int; exec @result = dbo.GetStatus @OrderId = 42; if @result = 0 print 'OK' else print 'Error'`,
        ['exec @result =', 'getorderstatus', '42', 'print', "'ok'", "print 'error'"]
    ),

    // ── TRUNCATE TABLE ────────────────────────────────────────────────────────
    check(
        'truncate_basic',
        `truncate table dbo.StagingData`,
        ['truncate table', 'dbo.stagingdata']
    ),

    // ── OPENROWSET (BULK) ─────────────────────────────────────────────────────
    check(
        'openrowset_bulk',
        `select * from openrowset(bulk 'C:\\data\\orders.csv', formatfile = 'C:\\fmt\\orders.fmt') as DataFile`,
        ['openrowset', 'bulk', 'datafile']
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

console.log(`\nProbe 43 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
