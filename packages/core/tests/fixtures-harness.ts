import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import prettier from 'prettier';
import type { Plugin } from 'prettier';

export interface FixtureHarnessConfig {
    parser: string;
    plugin: Plugin;
    fixturesDir: string;
    sharedDir: string;
    /**
     * The SQL's meaning in a canonical form (e.g. the parser's tree without source
     * positions), or null if it doesn't parse. When given, every fixture must keep the
     * same canonical form through formatting — snapshots and idempotence alone can't
     * catch output that is stable but means something else.
     */
    canonical?: (sql: string) => string | null;
}

// Option sets the meaning check formats each fixture with: the defaults, plus
// the non-default options that change the most output.
const EQUIVALENCE_VARIANTS: Record<string, unknown>[] = [
    {},
    { sqlKeywordCase: 'upper', sqlCommaStyle: 'leading' },
    { sqlKeywordCase: 'preserve' },
    { sqlDensity: 'compact', printWidth: 40 },
    { sqlDensity: 'spacious' },
];

export function collectFixtures(dir: string): string[] {
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

export function makeFmt(parser: string, plugin: Plugin) {
    return (sql: string, opts: Record<string, unknown> = {}): Promise<string> =>
        prettier.format(sql, { parser, plugins: [plugin], printWidth: 80, ...opts });
}

function fixtureBlock(
    label: string,
    dir: string,
    fmt: ReturnType<typeof makeFmt>,
    canonical?: FixtureHarnessConfig['canonical'],
): void {
    describe(label, () => {
        if (!existsSync(dir)) return;
        for (const file of collectFixtures(dir)) {
            const name = relative(dir, file);
            it(name, async () => {
                const input = readFileSync(file, 'utf-8').trim();
                const result = await fmt(input);
                expect(result).toMatchSnapshot();
                expect(await fmt(result)).toBe(result);
                if (canonical) {
                    const expected = canonical(input);
                    expect(expected, 'fixture must parse').not.toBeNull();
                    for (const opts of EQUIVALENCE_VARIANTS) {
                        const output = Object.keys(opts).length ? await fmt(input, opts) : result;
                        expect(canonical(output), `formatting changed the meaning with ${JSON.stringify(opts)}`).toBe(expected);
                    }
                }
            });
        }
    });
}

export function registerFixtureTests(config: FixtureHarnessConfig): void {
    const fmt = makeFmt(config.parser, config.plugin);
    fixtureBlock('fixtures', config.fixturesDir, fmt, config.canonical);
    fixtureBlock('shared fixtures', config.sharedDir, fmt, config.canonical);
}
