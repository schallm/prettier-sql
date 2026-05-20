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
}

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

function fixtureBlock(label: string, dir: string, fmt: ReturnType<typeof makeFmt>): void {
    describe(label, () => {
        if (!existsSync(dir)) return;
        for (const file of collectFixtures(dir)) {
            const name = relative(dir, file);
            it(name, async () => {
                const input = readFileSync(file, 'utf-8').trim();
                const result = await fmt(input);
                expect(result).toMatchSnapshot();
                expect(await fmt(result)).toBe(result);
            });
        }
    });
}

export function registerFixtureTests(config: FixtureHarnessConfig): void {
    const fmt = makeFmt(config.parser, config.plugin);
    fixtureBlock('fixtures', config.fixturesDir, fmt);
    fixtureBlock('shared fixtures', config.sharedDir, fmt);
}
