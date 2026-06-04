/**
 * Probe 65 — CREATE INDEX variants, DROP statements, ALTER INDEX,
 *   CREATE TYPE (table type / scalar type),
 *   CREATE SEQUENCE, ALTER SEQUENCE,
 *   CREATE SCHEMA,
 *   CREATE SYNONYM,
 *   CREATE DATABASE / ALTER DATABASE,
 *   ENABLE / DISABLE TRIGGER,
 *   CREATE TRIGGER (UPDATE/DELETE/INSTEAD OF),
 *   ALTER VIEW,
 *   RENAME via sp_rename,
 *   EXECUTE AS / REVERT,
 *   COLUMN STORE INDEX,
 *   INCLUDE columns in index,
 *   FILTERED INDEX (WHERE clause on index)
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
    // ── CREATE INDEX ──────────────────────────────────────────────────────────
    check(
        'create_index_basic',
        `CREATE INDEX IX_Books_AuthorId ON Books(AuthorId)`,
        ['create index', 'ix_books_authorid', 'on books', 'authorid']
    ),
    check(
        'create_unique_index',
        `CREATE UNIQUE INDEX UQ_Authors_Email ON Authors(Email)`,
        ['create unique index', 'uq_authors_email', 'on authors', 'email']
    ),
    check(
        'create_index_include',
        `CREATE NONCLUSTERED INDEX IX_Books_Genre ON Books(GenreId) INCLUDE(Title, Price)`,
        ['create nonclustered index', 'on books', 'genreid', 'include', 'title', 'price']
    ),
    check(
        'create_filtered_index',
        `CREATE INDEX IX_Books_InStock ON Books(Price) WHERE InStock=1`,
        ['create index', 'ix_books_instock', 'on books', 'price', 'where instock = 1']
    ),
    check(
        'create_clustered_index',
        `CREATE CLUSTERED INDEX CX_Orders_Date ON Orders(OrderDate)`,
        ['create clustered index', 'cx_orders_date', 'on orders', 'orderdate']
    ),

    // ── ALTER INDEX ───────────────────────────────────────────────────────────
    check(
        'alter_index_rebuild',
        `ALTER INDEX IX_Books_AuthorId ON Books REBUILD`,
        ['alter index', 'ix_books_authorid', 'on books', 'rebuild']
    ),
    check(
        'alter_index_disable',
        `ALTER INDEX IX_Books_AuthorId ON Books DISABLE`,
        ['alter index', 'on books', 'disable']
    ),
    check(
        'alter_index_all_reorganize',
        `ALTER INDEX ALL ON Books REORGANIZE`,
        ['alter index all', 'on books', 'reorganize']
    ),

    // ── DROP statements ───────────────────────────────────────────────────────
    check(
        'drop_table',
        `DROP TABLE IF EXISTS dbo.TempData`,
        ['drop table', 'if exists', 'dbo.tempdata']
    ),
    check(
        'drop_index',
        `DROP INDEX IX_Books_AuthorId ON Books`,
        ['drop index', 'ix_books_authorid', 'on books']
    ),
    check(
        'drop_procedure',
        `DROP PROCEDURE IF EXISTS dbo.GetBooks`,
        ['drop procedure', 'if exists', 'dbo.getbooks']
    ),
    check(
        'drop_view',
        `DROP VIEW IF EXISTS dbo.BookSummary`,
        ['drop view', 'if exists', 'dbo.booksummary']
    ),
    check(
        'drop_function',
        `DROP FUNCTION IF EXISTS dbo.GetActiveBooks`,
        ['drop function', 'if exists', 'dbo.getactivebooks']
    ),

    // ── CREATE TYPE ───────────────────────────────────────────────────────────
    check(
        'create_type_table',
        `CREATE TYPE dbo.BookList AS TABLE (Id INT NOT NULL, Title NVARCHAR(200) NOT NULL, Price DECIMAL(10,2) NULL)`,
        ['create type', 'dbo.booklist', 'as table', 'id int', 'title nvarchar', 'price decimal']
    ),
    check(
        'create_type_scalar',
        `CREATE TYPE dbo.BookTitle FROM NVARCHAR(200) NOT NULL`,
        ['create type', 'dbo.booktitle', 'from nvarchar', 'not null']
    ),

    // ── CREATE SEQUENCE ───────────────────────────────────────────────────────
    check(
        'create_sequence',
        `CREATE SEQUENCE dbo.OrderSeq AS INT START WITH 1000 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9999999 CYCLE`,
        ['create sequence', 'dbo.orderseq', 'as int', 'start with 1000', 'increment by 1', 'cycle']
    ),

    // ── CREATE SCHEMA ─────────────────────────────────────────────────────────
    check(
        'create_schema',
        `CREATE SCHEMA reporting`,
        ['create schema', 'reporting']
    ),

    // ── CREATE SYNONYM ────────────────────────────────────────────────────────
    check(
        'create_synonym',
        `CREATE SYNONYM dbo.Books FOR OtherDb.dbo.Books`,
        ['create synonym', 'dbo.books', 'for otherdb.dbo.books']
    ),

    // ── ENABLE / DISABLE TRIGGER ──────────────────────────────────────────────
    check(
        'disable_trigger',
        `DISABLE TRIGGER trg_Books_Insert ON Books`,
        ['disable trigger', 'trg_books_insert', 'on books']
    ),
    check(
        'enable_trigger',
        `ENABLE TRIGGER ALL ON Books`,
        ['enable trigger', 'all', 'on books']
    ),

    // ── CREATE TRIGGER (UPDATE/DELETE) ────────────────────────────────────────
    check(
        'create_trigger_update_delete',
        `CREATE TRIGGER trg_Books_AuditChange ON dbo.Books AFTER UPDATE, DELETE AS BEGIN INSERT INTO BookAudit(BookId, Action) SELECT Id, CASE WHEN EXISTS(SELECT 1 FROM deleted d WHERE d.Id=inserted.Id) THEN 'Updated' ELSE 'Deleted' END FROM inserted END`,
        ['create trigger', 'after update, delete', 'begin', 'bookaudit', 'inserted', 'deleted', 'end']
    ),

    // ── INSTEAD OF TRIGGER ────────────────────────────────────────────────────
    check(
        'create_trigger_instead_of',
        `CREATE TRIGGER trg_BookView_Update ON dbo.BookView INSTEAD OF UPDATE AS BEGIN UPDATE Books SET Title=inserted.Title WHERE Id=inserted.Id END`,
        ['instead of update', 'begin', 'update books', 'inserted.title', 'inserted.id', 'end']
    ),

    // ── EXECUTE AS / REVERT ───────────────────────────────────────────────────
    check(
        'execute_as',
        `EXECUTE AS USER='AppUser'; SELECT * FROM dbo.Books; REVERT`,
        ['execute as user', "'appuser'", 'revert']
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

console.log(`\nProbe 65 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 600)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
