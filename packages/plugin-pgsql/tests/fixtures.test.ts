import { describe, it, expect } from 'vitest';
import { registerFixtureTests, makeFmt } from '../../core/tests/fixtures-harness.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../src/plugin/index.js';
import { canonical } from '../src/plugin/parser/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmt = makeFmt('pgsql', plugin);

registerFixtureTests({
    parser: 'pgsql',
    plugin,
    fixturesDir: join(__dirname, 'fixtures'),
    sharedDir: join(__dirname, '../../core/tests/fixtures/shared'),
    canonical,
});

// ---------------------------------------------------------------------------
// Option variants — run a representative query through each non-default option
// ---------------------------------------------------------------------------

const OPTION_SQL = `select id, title, price from books where in_stock = true and price < 50 order by price asc limit 10;`;

describe('options', () => {
    // preserve: keywords are rebuilt when printing, so match the input's dominant case
    it('sqlKeywordCase: preserve follows an upper-case input', async () => {
        const out = await fmt(`SELECT id FROM books WHERE price < 50 -- select from where`, { sqlKeywordCase: 'preserve' });
        expect(out).toContain('SELECT id\nFROM books\nWHERE price < 50');
    });

    it('sqlKeywordCase: preserve follows a lower-case input', async () => {
        const out = await fmt(`select id from books where title = 'SELECT FROM WHERE'`, { sqlKeywordCase: 'preserve' });
        expect(out).toContain("select id\nfrom books\nwhere title = 'SELECT FROM WHERE'");
    });

    it('sqlKeywordCase: upper', async () => {
        expect(await fmt(OPTION_SQL, { sqlKeywordCase: 'upper' })).toMatchSnapshot();
    });

    it('sqlKeywordCase: lower (default)', async () => {
        expect(await fmt(OPTION_SQL, { sqlKeywordCase: 'lower' })).toMatchSnapshot();
    });

    it('sqlCommaStyle: leading', async () => {
        const sql = `select id, title, price, author_id, in_stock from books where in_stock = true;`;
        expect(await fmt(sql, { sqlCommaStyle: 'leading' })).toMatchSnapshot();
    });

    it('sqlCommaStyle: trailing (default)', async () => {
        const sql = `select id, title, price, author_id, in_stock from books where in_stock = true;`;
        expect(await fmt(sql, { sqlCommaStyle: 'trailing' })).toMatchSnapshot();
    });

    it('sqlDensity: spacious (WHERE indented)', async () => {
        expect(await fmt(OPTION_SQL, { sqlDensity: 'spacious' })).toMatchSnapshot();
    });

    it('sqlDensity: compact (single WHERE inline)', async () => {
        expect(await fmt(`select id from books where price < 50;`, { sqlDensity: 'compact' })).toMatchSnapshot();
    });
});

// ---------------------------------------------------------------------------
// Unsupported constructs must fail loudly, never silently drop or mislabel SQL
// ---------------------------------------------------------------------------

describe('unsupported constructs', () => {
    it('throws a clear error for an unhandled expression (type modifier)', async () => {
        await expect(fmt(`select 1::foo(1 + 1);`)).rejects.toThrow(
            /Unsupported type modifier \(AExpr\)/
        );
    });
});
