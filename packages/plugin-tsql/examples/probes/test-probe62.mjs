/**
 * Probe 62 — Subquery edge cases, set operators, pivot/unpivot,
 *   EXCEPT / INTERSECT, UNION ALL with ORDER BY,
 *   correlated subqueries, scalar subquery in SELECT,
 *   derived tables, multiple CTEs,
 *   CROSS APPLY / OUTER APPLY,
 *   TABLESAMPLE,
 *   FOR XML / FOR JSON,
 *   OPENROWSET / OPENJSON / OPENQUERY,
 *   ROLLUP / CUBE / GROUPING SETS,
 *   VALUES as standalone derived table
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
    // ── UNION / INTERSECT / EXCEPT ────────────────────────────────────────────
    check(
        'union_all',
        `SELECT Id, Title FROM Books WHERE GenreId=1 UNION ALL SELECT Id, Title FROM ArchivedBooks WHERE GenreId=1`,
        ['union all', 'archivedbooks']
    ),
    check(
        'intersect',
        `SELECT AuthorId FROM Books INTERSECT SELECT AuthorId FROM FeaturedBooks`,
        ['intersect', 'featuredbooks']
    ),
    check(
        'except',
        `SELECT AuthorId FROM Books EXCEPT SELECT AuthorId FROM BannedAuthors`,
        ['except', 'bannedauthors']
    ),
    check(
        'union_order_by',
        `SELECT Id, Title FROM Books WHERE GenreId=1 UNION ALL SELECT Id, Title FROM Books WHERE GenreId=2 ORDER BY Title`,
        ['union all', 'order by', 'title']
    ),

    // ── CROSS APPLY / OUTER APPLY ─────────────────────────────────────────────
    check(
        'cross_apply',
        `SELECT o.Id, d.Total FROM dbo.Orders o CROSS APPLY (SELECT SUM(Price*Qty) AS Total FROM dbo.OrderItems WHERE OrderId=o.Id) d`,
        ['cross apply', 'sum', 'orderitems']
    ),
    check(
        'outer_apply',
        `SELECT a.Id, b.Title FROM dbo.Authors a OUTER APPLY (SELECT TOP(1) Title FROM dbo.Books WHERE AuthorId=a.Id ORDER BY Price DESC) b`,
        ['outer apply', 'top', 'title']
    ),

    // ── Correlated subquery ───────────────────────────────────────────────────
    check(
        'correlated_subquery_select',
        `SELECT Id, Title, (SELECT COUNT(*) FROM OrderItems WHERE BookId=Books.Id) AS SaleCount FROM Books`,
        ['select count', 'orderitems', 'bookid = books.id', 'salecount']
    ),
    check(
        'correlated_subquery_where',
        `SELECT Id, Title FROM Authors WHERE EXISTS (SELECT 1 FROM Books WHERE Books.AuthorId=Authors.Id AND Books.Price>50)`,
        ['exists', 'books.authorid = authors.id', 'price > 50']
    ),

    // ── Multiple CTEs ─────────────────────────────────────────────────────────
    check(
        'multiple_ctes',
        `WITH TopAuthors AS (SELECT AuthorId, COUNT(*) AS Cnt FROM Books GROUP BY AuthorId HAVING COUNT(*)>5), PricedBooks AS (SELECT Id, Title, AuthorId FROM Books WHERE Price>20) SELECT b.Title, a.Cnt FROM PricedBooks b INNER JOIN TopAuthors a ON b.AuthorId=a.AuthorId`,
        ['with', 'topauthors as', 'pricedbooks as', 'inner join topauthors']
    ),

    // ── ROLLUP / CUBE / GROUPING SETS ─────────────────────────────────────────
    check(
        'rollup',
        `SELECT GenreId, AuthorId, SUM(Price) AS TotalPrice FROM Books GROUP BY ROLLUP(GenreId, AuthorId)`,
        ['group by', 'rollup', 'genreid', 'authorid', 'totalprice']
    ),
    check(
        'cube',
        `SELECT GenreId, AuthorId, SUM(Price) AS TotalPrice FROM Books GROUP BY CUBE(GenreId, AuthorId)`,
        ['group by', 'cube', 'genreid', 'authorid']
    ),
    check(
        'grouping_sets',
        `SELECT GenreId, AuthorId, SUM(Price) AS Total FROM Books GROUP BY GROUPING SETS((GenreId, AuthorId),(GenreId),(AuthorId),())`,
        ['grouping sets', 'genreid', 'authorid']
    ),

    // ── PIVOT / UNPIVOT ───────────────────────────────────────────────────────
    check(
        'pivot',
        `SELECT GenreId, [1] AS Q1, [2] AS Q2, [3] AS Q3, [4] AS Q4 FROM (SELECT GenreId, DATEPART(QUARTER, OrderDate) AS Qtr, Total FROM Orders) AS src PIVOT (SUM(Total) FOR Qtr IN ([1],[2],[3],[4])) AS pvt`,
        ['pivot', 'sum(total)', 'for qtr in', 'genreid']
    ),
    check(
        'unpivot',
        `SELECT AuthorId, Quarter, Sales FROM (SELECT AuthorId, Q1, Q2, Q3, Q4 FROM AuthorSales) AS src UNPIVOT (Sales FOR Quarter IN (Q1, Q2, Q3, Q4)) AS upvt`,
        ['unpivot', 'sales for quarter in', 'authorid']
    ),

    // ── TABLESAMPLE ───────────────────────────────────────────────────────────
    check(
        'tablesample',
        `SELECT Id, Title FROM Books TABLESAMPLE SYSTEM(10 PERCENT)`,
        ['tablesample', 'system', '10', 'percent']
    ),

    // ── FOR XML ───────────────────────────────────────────────────────────────
    check(
        'for_xml_auto',
        `SELECT Id, Title FROM Books FOR XML AUTO`,
        ['for xml', 'auto']
    ),
    check(
        'for_xml_path',
        `SELECT Id AS '@Id', Title FROM Books FOR XML PATH('Book'), ROOT('Books')`,
        ['for xml', 'path', "'book'", 'root']
    ),

    // ── FOR JSON ──────────────────────────────────────────────────────────────
    check(
        'for_json_auto',
        `SELECT Id, Title, Price FROM Books WHERE InStock=1 FOR JSON AUTO`,
        ['for json', 'auto']
    ),
    check(
        'for_json_path',
        `SELECT Id AS 'book.id', Title AS 'book.title', Price AS 'book.price' FROM Books FOR JSON PATH, ROOT('books'), WITHOUT_ARRAY_WRAPPER`,
        ['for json', 'path', 'root', 'without_array_wrapper']
    ),

    // ── OPENJSON ──────────────────────────────────────────────────────────────
    check(
        'openjson_basic',
        `SELECT Id, Title, Price FROM OPENJSON(@json) WITH (Id INT '$.id', Title NVARCHAR(200) '$.title', Price DECIMAL(10,2) '$.price')`,
        ['openjson', 'with', 'int', 'nvarchar', 'decimal']
    ),

    // ── OPENQUERY ─────────────────────────────────────────────────────────────
    check(
        'openquery',
        `SELECT * FROM OPENQUERY(LinkedServer, 'SELECT Id, Name FROM RemoteDb.dbo.Table1')`,
        ['openquery', 'linkedserver']
    ),

    // ── TABLESAMPLE with REPEATABLE ───────────────────────────────────────────
    check(
        'tablesample_repeatable',
        `SELECT Id, Title FROM Books TABLESAMPLE(1000 ROWS) REPEATABLE(12345)`,
        ['tablesample', '1000 rows', 'repeatable', '12345']
    ),

    // ── Derived table (subquery in FROM) ──────────────────────────────────────
    check(
        'derived_table',
        `SELECT d.AuthorId, d.AvgPrice FROM (SELECT AuthorId, AVG(Price) AS AvgPrice FROM Books WHERE InStock=1 GROUP BY AuthorId) AS d WHERE d.AvgPrice > 25`,
        ['avg(price)', 'avgprice', 'from books', 'as d', 'where d.avgprice']
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

console.log(`\nProbe 62 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 500)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
