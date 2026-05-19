import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import prettier from 'prettier';
import plugin from '../src/plugin/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

async function fmt(sql: string): Promise<string> {
    return prettier.format(sql, {
        parser: 'tsql',
        plugins: [plugin],
        printWidth: 80,
    });
}

/** Recursively collect all .sql input files (skip .output.sql files). */
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
            const result2 = await fmt(result);
            expect(result2).toBe(result);
        });
    }
});
