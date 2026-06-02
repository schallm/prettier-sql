import { describe, it, expect } from 'vitest';
import { registerFixtureTests, makeFmt } from '../../core/tests/fixtures-harness.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../src/plugin/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmt = makeFmt('tsql', plugin);

registerFixtureTests({
    parser: 'tsql',
    plugin,
    fixturesDir: join(__dirname, 'fixtures'),
    sharedDir: join(__dirname, '../../core/tests/fixtures/shared'),
});

// ---------------------------------------------------------------------------
// Regression: filtered index WHERE predicate must be formatted (not raw text)
// ---------------------------------------------------------------------------

describe('filtered index', () => {
    it('normalises WHERE predicate spacing', async () => {
        const sql = `CREATE INDEX IX_Books_InStock ON Books(Price) WHERE InStock=1`;
        expect(await fmt(sql)).toMatchInlineSnapshot(`
"create index IX_Books_InStock
  on Books (
    Price asc
  )
  where InStock = 1;"
`);
    });

    it('normalises compound WHERE predicate', async () => {
        const sql = `CREATE UNIQUE INDEX UQ_Orders_Active ON Orders(CustomerId) WHERE Status<>'Cancelled' AND Total>0`;
        expect(await fmt(sql)).toMatchInlineSnapshot(`
"create unique index UQ_Orders_Active
  on Orders (
    CustomerId asc
  )
  where
    Status <> 'Cancelled'
    and Total > 0;"
`);
    });
});

// ---------------------------------------------------------------------------
// Option variants — run a representative query through each non-default option
// ---------------------------------------------------------------------------

const OPTION_SQL = `select b.BookId, b.Title, b.Price from Books as b inner join Authors as a on b.AuthorId = a.Id where b.InStock = 1 order by b.Title asc`;

describe('options', () => {
    it('sqlKeywordCase: upper', async () => {
        expect(await fmt(OPTION_SQL, { sqlKeywordCase: 'upper' })).toMatchSnapshot();
    });

    it('sqlKeywordCase: lower (default)', async () => {
        expect(await fmt(OPTION_SQL, { sqlKeywordCase: 'lower' })).toMatchSnapshot();
    });

    it('sqlCommaStyle: leading', async () => {
        const sql = `select BookId, Title, Price, AuthorId, InStock from Books where InStock = 1`;
        expect(await fmt(sql, { sqlCommaStyle: 'leading' })).toMatchSnapshot();
    });

    it('sqlCommaStyle: trailing (default)', async () => {
        const sql = `select BookId, Title, Price, AuthorId, InStock from Books where InStock = 1`;
        expect(await fmt(sql, { sqlCommaStyle: 'trailing' })).toMatchSnapshot();
    });

    it('sqlDensity: spacious', async () => {
        expect(await fmt(OPTION_SQL, { sqlDensity: 'spacious' })).toMatchSnapshot();
    });

    it('sqlDensity: compact', async () => {
        expect(await fmt(`select BookId from Books where InStock = 1`, { sqlDensity: 'compact' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (wrapping columns)', async () => {
        const sql = `select OrderId, CustomerId, ProductId, Quantity, UnitPrice, TotalAmount, OrderDate, ShipDate from Orders where IsActive = 1`;
        expect(await fmt(sql, { sqlDensity: 'compact' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (group by wrapping)', async () => {
        const sql = `select CustomerId, ProductCategoryId, RegionId, sum(TotalAmount) as Revenue, count(*) as OrderCount from Orders group by CustomerId, ProductCategoryId, RegionId`;
        expect(await fmt(sql, { sqlDensity: 'compact' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (ORDER BY wraps with indent)', async () => {
        // When ORDER BY items exceed printWidth they must indent under the keyword,
        // not continue at the same level as surrounding statements.
        const sql = `select AuthorId, GenreId, count(*) as TotalBookCount from Books where InStock = 1 group by AuthorId, GenreId order by TotalBookCount desc, AuthorId asc, GenreId asc, PublisherId asc, PublishedYear desc`;
        expect(await fmt(sql, { sqlDensity: 'compact' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (JOIN ON wraps to indented line)', async () => {
        // When the ON clause is too long to stay on the JOIN line, the whole
        // condition must drop to a new indented line as a unit — not split at AND.
        const sql = `select b.Title, author.FirstName, author.LastName from Books as b inner join Authors as author on author.AuthorId = b.AuthorId and author.IsActive = 1 inner join Genres as g on g.GenreId = b.GenreId`;
        expect(await fmt(sql, { sqlDensity: 'compact' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (function args fill by width)', async () => {
        // Function call arguments should pack as many per line as fit within
        // printWidth, not one-per-line when they overflow.
        const sql = `select concat(FirstName, ' ', MiddleName, ' ', LastName, ' (', Email, ')', ' / ', PhoneNumber, ' / ', City, ', ', Country) as ContactInfo from Authors where IsActive = 1`;
        expect(await fmt(sql, { sqlDensity: 'compact' })).toMatchSnapshot();
    });
});
