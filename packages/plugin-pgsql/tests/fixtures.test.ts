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

    it('sqlKeywordCase: preserve ignores a dollar-quoted body', async () => {
        const sql = 'create table t (a int);\ncreate function f() returns int language plpgsql as $$ BEGIN RETURN 1; END IF; END LOOP; END $$;\nselect a from t;';
        const out = await fmt(sql, { sqlKeywordCase: 'preserve' });
        expect(out).toContain('create table t');
        expect(out).toContain('$$ BEGIN RETURN 1;');
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

    // Each operator of a chain nests one node deeper: past ~30 the JSON the parser sends
    // needs more than the serializer's default depth, and at ~2000 the parse tree passes
    // the 4000 levels pgsqlparser decodes
    const chain = (n: number) => `select ${Array.from({ length: n }, (_, i) => `c${i}`).join(' || ')} from t;`;

    it('formats a long operator chain', async () => {
        const out = await fmt(chain(45));
        expect(out).toContain('c44');
        expect(await fmt(out)).toBe(out);
    });

    it('throws a clear error for a chain too deep for the parser', async () => {
        await expect(fmt(chain(2000))).rejects.toThrow(/nested more than 4000 levels deep/);
    });
});

// ---------------------------------------------------------------------------
// Long lines — how lists, calls and clauses that don't fit wrap in each density
// ---------------------------------------------------------------------------

const LONG_LINES_SQL = [
    `select coalesce(a.first_choice_column, a.second_choice_column, a.third_choice_column, a.default_value) as chosen from t a;`,
    `select a.id from t a where a.status in ('pending', 'shipped', 'cancelled', 'returned', 'refunded', 'on_hold', 'archived');`,
    `select a.id, row_number() over (partition by a.account_id, a.region_id order by a.created_at desc, a.id) as rn from t a;`,
    `create table orders (order_identifier integer not null constraint pk_orders_order_identifier primary key, note text default 'none');`,
    `create function f(first_argument integer, second_argument text, third_argument boolean) returns integer language sql as 'select 1';`,
    `copy orders from '/tmp/orders.csv' (format csv, header true, delimiter ',', null '', encoding 'UTF8');`,
].join('\n');

describe('long lines in every density', () => {
    for (const [name, opts] of Object.entries({
        compact: { sqlDensity: 'compact' },
        spacious: { sqlDensity: 'spacious' },
        'leading commas': { sqlCommaStyle: 'leading' },
        'narrow (printWidth 40)': { printWidth: 40 },
    })) {
        it(name, async () => {
            const out = await fmt(LONG_LINES_SQL, opts);
            expect(out).toMatchSnapshot();
            expect(await fmt(out, opts)).toBe(out);
        });
    }
});
