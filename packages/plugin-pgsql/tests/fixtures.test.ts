import { describe, it, expect } from 'vitest';
import { registerFixtureTests, makeFmt } from '../../core/tests/fixtures-harness.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import plugin from '../src/plugin/index.js';
import type { SqlNode } from '@prettier-sql/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmt = makeFmt('pgsql', plugin);

registerFixtureTests({
    parser: 'pgsql',
    plugin,
    fixturesDir: join(__dirname, 'fixtures'),
    sharedDir: join(__dirname, '../../core/tests/fixtures/shared'),
});

// ---------------------------------------------------------------------------
// Option variants — run a representative query through each non-default option
// ---------------------------------------------------------------------------

const OPTION_SQL = `select id, title, price from books where in_stock = true and price < 50 order by price asc limit 10;`;

describe('options', () => {
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
    it('throws a clear error for an unhandled expression (COLLATE clause)', async () => {
        await expect(fmt(`select name collate "C" from t;`)).rejects.toThrow(
            /Unsupported expression \(CollateClause\)/
        );
    });

    it('throws a clear error for an unhandled constant kind (bit-string literal)', async () => {
        await expect(fmt(`select b'101' from t;`)).rejects.toThrow(/Unsupported constant \(Bsval\)/);
    });

    it('throws a clear error for an unhandled DROP object name shape (DROP CAST)', async () => {
        await expect(fmt(`drop cast (text as integer);`)).rejects.toThrow(/Unsupported DROP CAST name part/);
    });
});

// ---------------------------------------------------------------------------
// Formatting must not change meaning: re-parsing the output gives the same AST
// ---------------------------------------------------------------------------

function astOf(sql: string): string {
    const ast = plugin.parsers!.pgsql!.parse(sql, {} as never) as SqlNode;
    return JSON.stringify(ast, (key, value) =>
        ['startOffset', 'endOffset', 'leadingComments', 'trailingComment'].includes(key) ? undefined : value,
    );
}

describe('formatting preserves meaning', () => {
    const files = [
        'select/precedence.sql',
        'select/quoted-identifiers.sql',
        'ddl/roles.sql',
        'ddl/policies.sql',
        'dml/only.sql',
    ];
    const variants = [
        {},
        { sqlKeywordCase: 'upper' },
        { sqlKeywordCase: 'preserve' },
        { sqlDensity: 'compact', printWidth: 40 },
        { sqlDensity: 'spacious' },
    ];
    for (const file of files) {
        for (const opts of variants) {
            it(`${file} ${JSON.stringify(opts)}`, async () => {
                const input = readFileSync(join(__dirname, 'fixtures', file), 'utf-8');
                expect(astOf(await fmt(input, opts))).toBe(astOf(input));
            });
        }
    }
});
