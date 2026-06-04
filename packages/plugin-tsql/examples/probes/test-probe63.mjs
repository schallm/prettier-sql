/**
 * Probe 63 — Data type edge cases, string functions, math functions,
 *   type conversions, NULL handling, date functions,
 *   IIF, CHOOSE, COALESCE, NULLIF,
 *   string aggregation (STRING_AGG),
 *   FORMAT function,
 *   PARSE / TRY_PARSE,
 *   CONCAT / CONCAT_WS,
 *   STUFF, CHARINDEX, PATINDEX,
 *   computed columns in CREATE TABLE,
 *   ROWVERSION / TIMESTAMP columns,
 *   SPARSE columns,
 *   column DEFAULT constraints,
 *   multi-column primary key,
 *   UNIQUE constraint inline + table-level
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
    // ── IIF / CHOOSE ──────────────────────────────────────────────────────────
    check(
        'iif',
        `SELECT Id, IIF(Price > 50, 'Expensive', 'Cheap') AS PriceCategory FROM Books`,
        ['iif', 'price > 50', "'expensive'", "'cheap'", 'pricecategory']
    ),
    check(
        'choose',
        `SELECT Id, CHOOSE(GenreId, 'Fiction', 'Non-Fiction', 'Science', 'History') AS GenreName FROM Books`,
        ['choose', 'genreid', "'fiction'", 'genrename']
    ),

    // ── COALESCE / NULLIF ─────────────────────────────────────────────────────
    check(
        'coalesce',
        `SELECT Id, COALESCE(MiddleName, FirstName, 'Unknown') AS DisplayName FROM Authors`,
        ['coalesce', 'middlename', 'firstname', "'unknown'", 'displayname']
    ),
    check(
        'nullif',
        `SELECT Id, NULLIF(Price, 0) AS SafePrice FROM Books`,
        ['nullif', 'price', '0', 'safeprice']
    ),

    // ── STRING_AGG ────────────────────────────────────────────────────────────
    check(
        'string_agg',
        `SELECT AuthorId, STRING_AGG(Title, ', ') WITHIN GROUP (ORDER BY Title) AS Titles FROM Books GROUP BY AuthorId`,
        ['string_agg', 'title', "', '", 'within group', 'order by title', 'titles']
    ),

    // ── CONCAT / CONCAT_WS ────────────────────────────────────────────────────
    check(
        'concat',
        `SELECT CONCAT(FirstName, ' ', LastName) AS FullName FROM Authors`,
        ['concat', 'firstname', "' '", 'lastname', 'fullname']
    ),
    check(
        'concat_ws',
        `SELECT CONCAT_WS(', ', LastName, FirstName, MiddleName) AS FullName FROM Authors`,
        ['concat_ws', "', '", 'lastname', 'firstname', 'middlename']
    ),

    // ── FORMAT ────────────────────────────────────────────────────────────────
    check(
        'format_currency',
        `SELECT Id, FORMAT(Price, 'C2', 'en-US') AS FormattedPrice FROM Books`,
        ['format', 'price', "'c2'", "'en-us'", 'formattedprice']
    ),
    check(
        'format_date',
        `SELECT Id, FORMAT(OrderDate, 'yyyy-MM-dd') AS FormattedDate FROM Orders`,
        ['format', 'orderdate', "'yyyy-mm-dd'"]
    ),

    // ── PARSE / TRY_PARSE ─────────────────────────────────────────────────────
    check(
        'parse',
        `SELECT PARSE('25/10/2024' AS DATE USING 'fr-FR') AS ParsedDate`,
        ['parse', "'25/10/2024'", 'as date', "'fr-fr'", 'parseddate']
    ),
    check(
        'try_parse',
        `SELECT TRY_PARSE('not-a-date' AS DATE) AS MaybeDate`,
        ['try_parse', "'not-a-date'", 'as date', 'maybedate']
    ),

    // ── STUFF / CHARINDEX / PATINDEX ──────────────────────────────────────────
    check(
        'stuff',
        `SELECT STUFF(Email, 1, CHARINDEX('@', Email)-1, 'user') AS MaskedEmail FROM Authors`,
        ['stuff', 'email', 'charindex', "'@'", "'user'", 'maskedemail']
    ),
    check(
        'patindex',
        `SELECT Title, PATINDEX('%[0-9]%', Title) AS DigitPos FROM Books WHERE PATINDEX('%[0-9]%', Title) > 0`,
        ['patindex', "'%[0-9]%'", 'title', 'digitpos']
    ),

    // ── Date functions ────────────────────────────────────────────────────────
    check(
        'datediff',
        `SELECT Id, DATEDIFF(day, OrderDate, GETDATE()) AS DaysOld FROM Orders`,
        ['datediff', 'day', 'orderdate', 'getdate', 'daysold']
    ),
    check(
        'dateadd',
        `SELECT Id, DATEADD(month, 3, ExpiryDate) AS NewExpiry FROM Subscriptions`,
        ['dateadd', 'month', '3', 'expirydate', 'newexpiry']
    ),
    check(
        'datepart_datename',
        `SELECT DATEPART(year, OrderDate) AS Yr, DATENAME(month, OrderDate) AS MonthName FROM Orders`,
        ['datepart', 'year', 'datename', 'month', 'orderdate', 'yr', 'monthname']
    ),
    check(
        'eomonth',
        `SELECT EOMONTH(OrderDate) AS LastDayOfMonth, EOMONTH(OrderDate, 1) AS NextMonthEnd FROM Orders`,
        ['eomonth', 'orderdate', 'lastdayofmonth', 'nextmonthend']
    ),

    // ── Computed columns in CREATE TABLE ──────────────────────────────────────
    check(
        'computed_column',
        `CREATE TABLE OrderItems(Id INT IDENTITY NOT NULL, UnitPrice DECIMAL(10,2) NOT NULL, Quantity INT NOT NULL, LineTotal AS UnitPrice*Quantity PERSISTED)`,
        ['create table', 'unitprice', 'quantity', 'linetotal as', 'unitprice * quantity', 'persisted']
    ),

    // ── ROWVERSION / TIMESTAMP ────────────────────────────────────────────────
    check(
        'rowversion_column',
        `CREATE TABLE Books(Id INT PRIMARY KEY, Title NVARCHAR(200) NOT NULL, RowVer ROWVERSION NOT NULL)`,
        ['create table', 'rowversion', 'rowver']
    ),

    // ── Multi-column PRIMARY KEY ──────────────────────────────────────────────
    check(
        'multi_col_pk',
        `CREATE TABLE OrderItems(OrderId INT NOT NULL, ProductId INT NOT NULL, Qty INT NOT NULL, CONSTRAINT PK_OrderItems PRIMARY KEY(OrderId, ProductId))`,
        ['primary key', 'orderid', 'productid']
    ),

    // ── UNIQUE constraint ─────────────────────────────────────────────────────
    check(
        'unique_constraint',
        `CREATE TABLE Authors(Id INT PRIMARY KEY, Email NVARCHAR(200) NOT NULL UNIQUE, Name NVARCHAR(200) NOT NULL, CONSTRAINT UQ_Authors_Name UNIQUE(Name))`,
        ['unique', 'email', 'uq_authors_name', 'name']
    ),

    // ── Column DEFAULT ────────────────────────────────────────────────────────
    check(
        'column_default',
        `CREATE TABLE Orders(Id INT PRIMARY KEY, Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', CreatedAt DATETIME NOT NULL DEFAULT GETDATE())`,
        ['create table', "default 'pending'", 'default getdate']
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

console.log(`\nProbe 63 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 500)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
