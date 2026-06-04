/**
 * Probe 61 — TRY/CATCH, WHILE, CURSOR, WAITFOR, THROW,
 *   RETURN, BREAK, CONTINUE, GOTO/label,
 *   OUTPUT clause (INSERT/UPDATE/DELETE),
 *   BULK INSERT, TRUNCATE TABLE,
 *   PRINT with expressions,
 *   multi-statement TVF,
 *   SELECT INTO (table copy),
 *   OPTION hints (MAXDOP, RECOMPILE, OPTIMIZE FOR)
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
    // ── TRY / CATCH ──────────────────────────────────────────────────────────
    check(
        'try_catch_basic',
        `BEGIN TRY INSERT INTO Books(Title) VALUES('test') END TRY BEGIN CATCH PRINT ERROR_MESSAGE() END CATCH`,
        ['begin try', 'end try', 'begin catch', 'end catch', 'error_message']
    ),
    check(
        'try_catch_throw',
        `BEGIN TRY SELECT 1/0 END TRY BEGIN CATCH THROW 50001, 'Divide by zero', 1; END CATCH`,
        ['begin try', 'end try', 'begin catch', 'end catch', 'throw', '50001', 'divide by zero']
    ),

    // ── WHILE / BREAK / CONTINUE ──────────────────────────────────────────────
    check(
        'while_basic',
        `DECLARE @i INT=0; WHILE @i<10 BEGIN SET @i=@i+1 END`,
        ['while', '@i', '< 10', 'begin', 'set @i', 'end']
    ),
    check(
        'while_break_continue',
        `WHILE 1=1 BEGIN IF @x>100 BREAK; SET @x=@x+1; IF @x%2=0 CONTINUE; PRINT @x END`,
        ['while', 'break', 'continue', 'print']
    ),

    // ── CURSOR ────────────────────────────────────────────────────────────────
    check(
        'cursor_basic',
        `DECLARE cur CURSOR FOR SELECT Id, Title FROM Books; OPEN cur; FETCH NEXT FROM cur INTO @Id, @Title; CLOSE cur; DEALLOCATE cur`,
        ['declare', 'cursor', 'for', 'open cur', 'fetch next', 'from cur', 'into', 'close cur', 'deallocate cur']
    ),

    // ── WAITFOR ───────────────────────────────────────────────────────────────
    check(
        'waitfor_delay',
        `WAITFOR DELAY '00:00:05'`,
        ['waitfor', 'delay', "'00:00:05'"]
    ),
    check(
        'waitfor_time',
        `WAITFOR TIME '23:00:00'`,
        ['waitfor', 'time', "'23:00:00'"]
    ),

    // ── RETURN ────────────────────────────────────────────────────────────────
    check(
        'return_value',
        `CREATE PROCEDURE dbo.GetStatus AS BEGIN IF EXISTS(SELECT 1 FROM Books WHERE InStock=1) RETURN 1; RETURN 0 END`,
        ['create procedure', 'return 1', 'return 0']
    ),

    // ── GOTO / label ──────────────────────────────────────────────────────────
    check(
        'goto_label',
        `DECLARE @retry INT=0; retry_label: SET @retry=@retry+1; IF @retry<3 GOTO retry_label`,
        ['retry_label', 'goto retry_label', '@retry']
    ),

    // ── OUTPUT clause ─────────────────────────────────────────────────────────
    check(
        'insert_output',
        `INSERT INTO Books(Title,Price) OUTPUT INSERTED.Id, INSERTED.Title VALUES('Test',9.99)`,
        ['insert into', 'output', 'inserted.id', 'inserted.title', 'values']
    ),
    check(
        'update_output',
        `UPDATE Books SET Price=Price*0.9 OUTPUT DELETED.Price AS OldPrice, INSERTED.Price AS NewPrice WHERE InStock=1`,
        ['update', 'output', 'deleted.price', 'inserted.price', 'oldprice', 'newprice']
    ),
    check(
        'delete_output',
        `DELETE FROM Books OUTPUT DELETED.Id, DELETED.Title WHERE InStock=0`,
        ['delete', 'output', 'deleted.id', 'deleted.title']
    ),
    check(
        'output_into',
        `INSERT INTO Books(Title) OUTPUT INSERTED.Id, INSERTED.Title INTO @NewBooks VALUES('Test')`,
        ['output', 'inserted.id', 'inserted.title', 'into @newbooks']
    ),

    // ── TRUNCATE TABLE ────────────────────────────────────────────────────────
    check(
        'truncate_table',
        `TRUNCATE TABLE dbo.OrderItems`,
        ['truncate table', 'dbo.orderitems']
    ),

    // ── SELECT INTO ───────────────────────────────────────────────────────────
    check(
        'select_into',
        `SELECT Id, Title, Price INTO #TempBooks FROM Books WHERE InStock=1`,
        ['select', 'into #tempbooks', 'from books', 'instock = 1']
    ),

    // ── OPTION hints ──────────────────────────────────────────────────────────
    check(
        'option_maxdop',
        `SELECT * FROM Books WHERE InStock=1 OPTION(MAXDOP 4)`,
        ['option', 'maxdop', '4']
    ),
    check(
        'option_recompile',
        `SELECT * FROM Books WHERE Price>@MinPrice OPTION(RECOMPILE)`,
        ['option', 'recompile']
    ),
    check(
        'option_optimize_for',
        `SELECT * FROM Books WHERE AuthorId=@AuthorId OPTION(OPTIMIZE FOR (@AuthorId UNKNOWN))`,
        ['option', 'optimize for', '@authorid', 'unknown']
    ),

    // ── PRINT with expression ─────────────────────────────────────────────────
    check(
        'print_expression',
        `DECLARE @msg NVARCHAR(200)='Count: '+CAST(@@ROWCOUNT AS NVARCHAR); PRINT @msg`,
        ['print', '@msg', 'cast', '@@rowcount', 'nvarchar']
    ),

    // ── BULK INSERT ───────────────────────────────────────────────────────────
    check(
        'bulk_insert',
        `BULK INSERT dbo.Books FROM 'C:\\data\\books.csv' WITH (FIELDTERMINATOR=',', ROWTERMINATOR='\n', FIRSTROW=2)`,
        ['bulk insert', 'dbo.books', 'from', 'fieldterminator', 'rowterminator', 'firstrow']
    ),

    // ── Multi-statement TVF ───────────────────────────────────────────────────
    check(
        'multi_stmt_tvf',
        `CREATE FUNCTION dbo.GetActiveBooks(@MinPrice DECIMAL(10,2)) RETURNS @result TABLE(Id INT, Title NVARCHAR(200), Price DECIMAL(10,2)) AS BEGIN INSERT INTO @result SELECT Id,Title,Price FROM Books WHERE Price>=@MinPrice AND InStock=1; RETURN END`,
        ['create function', 'returns @result table', 'begin', 'insert into @result', 'return', 'end']
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

console.log(`\nProbe 61 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 500)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
