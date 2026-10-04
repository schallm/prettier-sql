import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { collectFixtures, makeFmt } from '../../core/tests/fixtures-harness.js';
import pgsqlPlugin from '../src/plugin/index.js';
import tsqlPlugin from '../../plugin-tsql/src/plugin/index.js';

// The shared fixtures are standard SQL that both dialects must format identically, so
// the same construct reads the same whichever plugin printed it. Each plugin's own
// snapshot can't catch the two drifting apart; this compares them directly.

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedDir = join(__dirname, '../../core/tests/fixtures/shared');
const pgsql = makeFmt('pgsql', pgsqlPlugin);
const tsql = makeFmt('tsql', tsqlPlugin);

const VARIANTS: Record<string, unknown>[] = [{}, { sqlDensity: 'compact' }, { sqlDensity: 'spacious' }];

// Shared fixtures the two dialects still format differently
const KNOWN_DIVERGENT = new Set([
    'ddl/alter-table.sql',
    'ddl/create-index.sql',
    'ddl/create-table.sql',
    'dml/update.sql',
    'select/joins.sql',
    'select/predicates.sql',
    'select/subqueries.sql',
]);

// A T-SQL batch that must stand alone (CREATE VIEW) ends with GO; PostgreSQL has no batches
const withoutGo = (sql: string): string => sql.replace(/^go\n/gm, '');

describe('shared fixtures format the same in both dialects', () => {
    for (const file of collectFixtures(sharedDir)) {
        const name = relative(sharedDir, file);
        const test = KNOWN_DIVERGENT.has(name) ? it.fails : it;
        test(name, async () => {
            const input = readFileSync(file, 'utf-8').trim();
            for (const opts of VARIANTS) {
                expect(withoutGo(await tsql(input, opts)), JSON.stringify(opts)).toBe(await pgsql(input, opts));
            }
        });
    }
});
