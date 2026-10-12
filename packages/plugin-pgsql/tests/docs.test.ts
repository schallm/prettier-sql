import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeFmt } from '../../core/tests/fixtures-harness.js';
import plugin from '../src/plugin/index.js';

// docs/examples.md shows each example as a diff: `-` lines the input, `+` lines what the
// formatter makes of it with the default options. Keep it true.
const fmt = makeFmt('pgsql', plugin);
const md = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'examples.md'), 'utf8');

describe('docs/examples.md', () => {
    for (const m of md.matchAll(/```diff\n([\s\S]*?)```/g)) {
        const lines = m[1]!.split('\n');
        const input = lines.filter((l) => l.startsWith('-')).map((l) => l.replace(/^- ?/, '')).join('\n');
        const expected = lines.filter((l) => l.startsWith('+')).map((l) => l.replace(/^\+ ?/, '')).join('\n');
        const heading = md.slice(0, m.index).match(/^#+ .*$/gm)?.at(-1) ?? '';
        it(`${heading} (line ${md.slice(0, m.index).split('\n').length})`, async () => {
            expect((await fmt(input)).trimEnd()).toBe(expected.trimEnd());
        });
    }
});
