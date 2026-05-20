import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import prettier from 'prettier';
import plugin from '../src/plugin/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const sharedDir = join(__dirname, '../../core/tests/fixtures/shared');

async function fmt(sql: string, opts: Record<string, unknown> = {}): Promise<string> {
    return prettier.format(sql, {
        parser: 'pgsql',
        plugins: [plugin],
        printWidth: 80,
        ...opts,
    });
}

function collectFixtures(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFixtures(full));
        } else if (entry.isFile() && entry.name.endsWith('.sql') && !entry.name.endsWith('.output.sql')) {
            results.push(full);
        }
    }
    return results.sort();
}

describe('fixtures', () => {
    for (const file of collectFixtures(fixturesDir)) {
        const name = relative(fixturesDir, file);
        it(name, async () => {
            const input = readFileSync(file, 'utf-8').trim();
            const result = await fmt(input);
            expect(result).toMatchSnapshot();
        });
    }
});

describe('shared fixtures', () => {
    if (!existsSync(sharedDir)) return;
    for (const file of collectFixtures(sharedDir)) {
        const name = relative(sharedDir, file);
        it(name, async () => {
            const input = readFileSync(file, 'utf-8').trim();
            const result = await fmt(input);
            expect(result).toMatchSnapshot();
        });
    }
});

// ---------------------------------------------------------------------------
// Idempotency — formatting twice must produce the same output as formatting once
// ---------------------------------------------------------------------------

describe('idempotency', () => {
    for (const file of collectFixtures(fixturesDir)) {
        const name = relative(fixturesDir, file);
        it(name, async () => {
            const input = readFileSync(file, 'utf-8').trim();
            const once = await fmt(input);
            const twice = await fmt(once);
            expect(twice).toBe(once);
        });
    }
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
