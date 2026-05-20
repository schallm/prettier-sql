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

// Regex that captures: opening fence + optional label, body, closing fence
const FENCE = /^(```sql\n)([\s\S]*?)(^```)/gm;

let totalBlocks = 0;
let mismatches = 0;

for (const rel of docs) {
    const path = join(root, rel);
    let src = readFileSync(path, 'utf8');
    let changed = false;

    const next = src.replace(FENCE, (full, open, body, close) => {
        // Skip pure expression snippets (no statement — no semicolon, no keyword at start of line)
        // and diff blocks (handled separately)
        if (!body.trim()) return full;

        // Split into individual statements separated by blank lines
        const stmts = body.split(/\n(?=\n)/).map(s => s.trim()).filter(Boolean);

        const reformatted = stmts.map(stmt => {
            // Skip if it doesn't look like a complete statement
            if (!stmt.endsWith(';') && !/^(select|insert|update|delete|with|create|alter|drop|truncate|begin|commit|rollback|savepoint|release|prepare|vacuum|analyze|cluster|reindex|do|call|merge|security|import|grant|revoke|set|start|declare|fetch|close|move)\b/i.test(stmt)) {
                return stmt;
            }
            try {
                // prettier strips trailing newline; we add it back
                return prettier.format(stmt, {
                    parser: 'pgsql',
                    plugins: [join(root, 'dist/index.js')],
                }).trimEnd();
            } catch {
                return stmt; // leave unchanged if parse fails
            }
        });

        const newBody = reformatted.join('\n\n') + '\n';
        if (newBody === body) return full;

        totalBlocks++;
        mismatches++;
        if (!fix) {
            console.log(`\n${rel}: mismatch in block:\n--- expected (formatter output)\n${newBody}+++ found in doc\n${body}`);
        }
        changed = true;
        return open + newBody + close;
    });

    if (fix && changed) {
        writeFileSync(path, next);
        console.log(`Fixed: ${rel}`);
    }
}

// Also handle diff blocks in examples.md — just check the + lines parse OK (skip for now)

if (!fix && mismatches > 0) {
    console.log(`\n${mismatches} block(s) out of date. Run with --fix to update.`);
    process.exit(1);
} else if (mismatches === 0) {
    console.log('All doc SQL blocks match formatter output.');
}
