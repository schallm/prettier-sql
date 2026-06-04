/**
 * Probe 64 — Transaction control, locking hints, index hints,
 *   NOLOCK / UPDLOCK / HOLDLOCK / ROWLOCK,
 *   USE database, SET options (XACT_ABORT, TRANSACTION ISOLATION),
 *   SAVE TRANSACTION, ROLLBACK TRANSACTION with savepoint,
 *   COMMIT TRANSACTION with name,
 *   @@TRANCOUNT / @@ERROR / @@IDENTITY / @@ROWCOUNT,
 *   IDENTITY_INSERT,
 *   DBCC statements,
 *   sp_executesql,
 *   Dynamic SQL with EXEC(@sql),
 *   TOP with PERCENT and WITH TIES,
 *   OFFSET / FETCH NEXT,
 *   SELECT DISTINCT,
 *   OVER() without PARTITION BY,
 *   NTILE / PERCENT_RANK / CUME_DIST
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
    // ── Transaction control ───────────────────────────────────────────────────
    check(
        'begin_commit_transaction',
        `BEGIN TRANSACTION; UPDATE Accounts SET Balance=Balance-100 WHERE Id=1; UPDATE Accounts SET Balance=Balance+100 WHERE Id=2; COMMIT TRANSACTION`,
        ['begin transaction', 'update accounts', 'balance', 'commit transaction']
    ),
    check(
        'begin_rollback_transaction',
        `BEGIN TRANSACTION; DELETE FROM Orders WHERE OrderDate<'2020-01-01'; IF @@ROWCOUNT>1000 ROLLBACK TRANSACTION ELSE COMMIT TRANSACTION`,
        ['begin transaction', 'delete from orders', 'rollback transaction', 'commit transaction', '@@rowcount']
    ),
    check(
        'save_transaction',
        `BEGIN TRANSACTION; SAVE TRANSACTION SavePoint1; DELETE FROM Temp WHERE Id>100; IF @@ERROR<>0 ROLLBACK TRANSACTION SavePoint1`,
        ['save transaction', 'savepoint1', '@@error', 'rollback transaction savepoint1']
    ),
    check(
        'named_transaction',
        `BEGIN TRANSACTION TransferFunds; UPDATE Accounts SET Balance-=500 WHERE Id=1; COMMIT TRANSACTION TransferFunds`,
        ['begin transaction transferfunds', '-=', 'commit transaction transferfunds']
    ),

    // ── SET options ───────────────────────────────────────────────────────────
    check(
        'set_xact_abort',
        `SET XACT_ABORT ON; BEGIN TRANSACTION; INSERT INTO Books(Title) VALUES('Test'); COMMIT`,
        ['set xact_abort on', 'begin transaction', 'insert into']
    ),
    check(
        'set_transaction_isolation',
        `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT * FROM Books`,
        ['set transaction isolation level', 'read uncommitted']
    ),
    check(
        'set_identity_insert',
        `SET IDENTITY_INSERT Books ON; INSERT INTO Books(Id,Title) VALUES(999,'Test'); SET IDENTITY_INSERT Books OFF`,
        ['set identity_insert books on', 'set identity_insert books off']
    ),

    // ── Locking hints ─────────────────────────────────────────────────────────
    check(
        'nolock_hint',
        `SELECT * FROM Books WITH(NOLOCK) WHERE InStock=1`,
        ['with (nolock)', 'instock = 1']
    ),
    check(
        'updlock_hint',
        `SELECT * FROM Books WITH(UPDLOCK, ROWLOCK) WHERE Id=@Id`,
        ['with (updlock', 'rowlock)']
    ),
    check(
        'holdlock_hint',
        `SELECT * FROM Inventory WITH(HOLDLOCK) WHERE ProductId=@Id`,
        ['with (holdlock)', 'inventoryid = @id']   // note: we just need holdlock present
    ),
    check(
        'nolock_hint_2',
        `SELECT b.Id, b.Title FROM Books b WITH(NOLOCK) INNER JOIN Genres g WITH(NOLOCK) ON b.GenreId=g.Id`,
        ['with (nolock)', 'inner join']
    ),

    // ── Index hints ───────────────────────────────────────────────────────────
    check(
        'index_hint',
        `SELECT Id, Title FROM Books WITH(INDEX(IX_Books_AuthorId)) WHERE AuthorId=@AuthorId`,
        ['with (index', 'ix_books_authorid', 'authorid']
    ),

    // ── TOP PERCENT / WITH TIES ────────────────────────────────────────────────
    check(
        'top_percent',
        `SELECT TOP(10) PERCENT Id, Title FROM Books ORDER BY Price DESC`,
        ['top (10) percent', 'order by price desc']
    ),
    check(
        'top_with_ties',
        `SELECT TOP(5) WITH TIES Id, Title, Price FROM Books ORDER BY Price DESC`,
        ['top (5) with ties', 'order by price desc']
    ),

    // ── OFFSET / FETCH ────────────────────────────────────────────────────────
    check(
        'offset_fetch',
        `SELECT Id, Title, Price FROM Books ORDER BY Price DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY`,
        ['order by price desc', 'offset 20 rows', 'fetch next 10 rows only']
    ),

    // ── SELECT DISTINCT ───────────────────────────────────────────────────────
    check(
        'select_distinct',
        `SELECT DISTINCT GenreId, AuthorId FROM Books WHERE InStock=1`,
        ['select distinct', 'genreid', 'authorid', 'instock = 1']
    ),

    // ── Window functions without PARTITION BY ─────────────────────────────────
    check(
        'row_number_no_partition',
        `SELECT ROW_NUMBER() OVER(ORDER BY Price DESC) AS RowNum, Id, Title FROM Books`,
        ['row_number()', 'over (', 'order by price desc', 'rownum']
    ),
    check(
        'ntile',
        `SELECT Id, Title, NTILE(4) OVER(ORDER BY Price DESC) AS Quartile FROM Books`,
        ['ntile', '4', 'over (', 'order by price desc', 'quartile']
    ),
    check(
        'percent_rank',
        `SELECT Id, Title, Price, PERCENT_RANK() OVER(ORDER BY Price) AS PctRank FROM Books`,
        ['percent_rank()', 'over (', 'order by price', 'pctrank']
    ),
    check(
        'cume_dist',
        `SELECT Id, Price, CUME_DIST() OVER(PARTITION BY GenreId ORDER BY Price) AS CumeDist FROM Books`,
        ['cume_dist()', 'over (', 'partition by genreid', 'order by price', 'cumedist']
    ),

    // ── sp_executesql ─────────────────────────────────────────────────────────
    check(
        'sp_executesql',
        `EXEC sp_executesql N'SELECT * FROM Books WHERE AuthorId=@Id', N'@Id INT', @Id=@AuthorId`,
        ['sp_executesql', "'select * from books", '@id int', '@id = @authorid']
    ),

    // ── DBCC statements ───────────────────────────────────────────────────────
    check(
        'dbcc_checkdb',
        `DBCC CHECKDB('BookstoreDB') WITH NO_INFOMSGS`,
        ['dbcc checkdb', 'bookstoredb', 'no_infomsgs']
    ),
    check(
        'dbcc_shrinkfile',
        `DBCC SHRINKFILE(BookstoreDB_Log, 100)`,
        ['dbcc shrinkfile', 'bookstoredb_log', '100']
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

console.log(`\nProbe 64 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 600)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
