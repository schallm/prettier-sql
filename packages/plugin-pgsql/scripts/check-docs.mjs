#!/usr/bin/env node
/**
 * Extracts SQL code blocks from doc files, formats each through the plugin,
 * and reports any that don't match. Exits 1 if any mismatch found.
 *
 * Usage: node scripts/check-docs.mjs [--fix]
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const fix = process.argv.includes('--fix');
const prettier = await import('prettier');

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '');
const docs = [
    'docs/formatting.md',
    'docs/examples.md',
    'docs/options.md',
    'docs/getting-started.md',
];

const FENCE = /^(```sql\n)([\s\S]*?)(^```)/gm;

async function reformat(body) {
    // Split on blank lines between statements
    const stmts = body.split(/\n\n+/).map(s => s.trim()).filter(Boolean);

    const results = await Promise.all(stmts.map(async stmt => {
        if (!stmt.endsWith(';')) return stmt;
        try {
            const out = await prettier.format(stmt, {
                parser: 'pgsql',
                plugins: [join(root, 'dist/index.js')],
            });
            return out.trimEnd();
        } catch {
            return stmt;
        }
    }));

    return results.join('\n\n') + '\n';
}

let mismatches = 0;

for (const rel of docs) {
    const path = join(root, rel);
    const src = readFileSync(path, 'utf8');
    const blocks = [];

    // Collect all sql blocks and their positions; skip ones preceded by <!-- check-docs:skip -->
    let match;
    FENCE.lastIndex = 0;
    while ((match = FENCE.exec(src)) !== null) {
        const before = src.slice(0, match.index);
        if (/<!--\s*check-docs:skip\s*-->\s*\n$/.test(before)) continue;
        blocks.push({ index: match.index, open: match[1], body: match[2], close: match[3], full: match[0] });
    }

    let next = src;
    let offset = 0;

    for (const block of blocks) {
        if (!block.body.trim()) continue;
        const newBody = await reformat(block.body);
        if (newBody === block.body) continue;

        mismatches++;
        if (!fix) {
            console.log(`\n${rel}: stale block\n--- doc has\n${block.body}+++ formatter produces\n${newBody}`);
        } else {
            const replacement = block.open + newBody + block.close;
            next = next.slice(0, block.index + offset) + replacement + next.slice(block.index + offset + block.full.length);
            offset += replacement.length - block.full.length;
        }
    }

    if (fix && next !== src) {
        writeFileSync(path, next);
        console.log(`Fixed: ${rel}`);
    }
}

if (mismatches === 0) {
    console.log('All doc SQL blocks match formatter output.');
} else if (!fix) {
    console.log(`\n${mismatches} block(s) out of date. Run: npm run fix:docs`);
    process.exit(1);
}
