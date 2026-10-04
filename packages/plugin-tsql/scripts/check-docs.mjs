#!/usr/bin/env node
/**
 * Extracts SQL code blocks from doc files, formats each through the plugin,
 * and reports any that don't match. Exits 1 if any mismatch found.
 *
 * Handles two block types:
 *   ```sql   — standalone SQL; reformatted and compared directly
 *   ```diff  — before/after pairs; "-" lines are input, "+" lines are expected output
 *
 * Annotate a block with <!-- check-docs:skip --> on the preceding line to skip it
 * (use this for option-specific examples that use non-default formatting options).
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

// The marker may be followed by a <!-- prettier-ignore --> line, which must sit right above the fence
const SKIP_MARKER = /<!--\s*check-docs:skip\s*-->\s*\n(<!--\s*prettier-ignore\s*-->\s*\n)?$/;
const SQL_FENCE  = /^(```sql\n)([\s\S]*?)(^```)/gm;
const DIFF_FENCE = /^(```diff\n)([\s\S]*?)(^```)/gm;

async function fmt(sql) {
    return prettier.format(sql, {
        parser: 'tsql',
        plugins: [join(root, 'dist/index.js')],
    });
}

/**
 * Reformat a ```sql block body. The whole block is formatted at once, since one statement can
 * hold blank lines of its own (around UNION, between a procedure's statements); a block that
 * doesn't parse as a whole is formatted statement by statement, keeping any that don't parse.
 */
async function reformatSql(body) {
    // A complete script ends with `;` (or a T-SQL batch's GO)
    if (/(;|\bgo)\s*$/i.test(body)) {
        try {
            return await fmt(body);
        } catch {
            // fall through to statement by statement
        }
    }
    const stmts = body.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    const results = await Promise.all(stmts.map(async stmt => {
        if (!stmt.endsWith(';')) return stmt;
        try {
            return (await fmt(stmt)).trimEnd();
        } catch {
            return stmt;
        }
    }));
    return results.join('\n\n') + '\n';
}

/** Check/fix a ```diff block body. Returns { newBody } if changed, null if unchanged or skipped. */
async function reformatDiff(body) {
    const lines = body.split('\n');
    // A blank line of the input or output is a bare "-" or "+"
    const isBefore = (l) => l === '-' || l.startsWith('- ');
    const isAfter  = (l) => l === '+' || l.startsWith('+ ');
    const beforeLines = lines.filter(isBefore).map(l => l.slice(2));
    const afterLines  = lines.filter(isAfter).map(l => l.slice(2));

    if (beforeLines.length === 0 || afterLines.length === 0) return null;

    const input = beforeLines.join('\n');
    if (!input.trim().endsWith(';')) return null;

    let formatted;
    try {
        formatted = (await fmt(input)).trimEnd();
    } catch {
        return null;
    }

    const expected = afterLines.join('\n');
    if (formatted === expected) return null;

    // Rebuild: keep "-" lines, replace "+" lines with formatted output
    const newPlusLines = formatted.split('\n').map(l => (l ? '+ ' + l : '+'));
    const nonPlus = lines.filter(l => !isAfter(l));
    // Insert new plus lines after the last minus line
    const lastMinus = nonPlus.reduce((acc, l, i) => isBefore(l) ? i : acc, -1);
    const rebuilt = [
        ...nonPlus.slice(0, lastMinus + 1),
        ...newPlusLines,
        ...nonPlus.slice(lastMinus + 1).filter(l => l !== ''),
    ];
    return rebuilt.join('\n') + '\n';
}

async function processDoc(rel) {
    const path = join(root, rel);
    const src = readFileSync(path, 'utf8');
    let mismatches = 0;
    let next = src;
    let offset = 0;

    async function checkBlocks(regex, reformat) {
        regex.lastIndex = 0;
        const blocks = [];
        let match;
        while ((match = regex.exec(src)) !== null) {
            const before = src.slice(0, match.index);
            if (SKIP_MARKER.test(before)) continue;
            blocks.push({ index: match.index, open: match[1], body: match[2], close: match[3], full: match[0] });
        }

        for (const block of blocks) {
            if (!block.body.trim()) continue;
            const newBody = await reformat(block.body);
            if (newBody === null || newBody === block.body) continue;

            mismatches++;
            if (!fix) {
                console.log(`\n${rel}: stale block\n--- doc has\n${block.body}+++ formatter produces\n${newBody}`);
            } else {
                const replacement = block.open + newBody + block.close;
                next = next.slice(0, block.index + offset) + replacement + next.slice(block.index + offset + block.full.length);
                offset += replacement.length - block.full.length;
            }
        }
    }

    await checkBlocks(SQL_FENCE,  reformatSql);
    await checkBlocks(DIFF_FENCE, reformatDiff);

    if (fix && next !== src) {
        writeFileSync(path, next);
        console.log(`Fixed: ${rel}`);
    }

    return mismatches;
}

let total = 0;
for (const rel of docs) {
    total += await processDoc(rel);
}

if (total === 0) {
    console.log('All doc SQL blocks match formatter output.');
} else if (!fix) {
    console.log(`\n${total} block(s) out of date. Run: npm run fix:docs`);
    process.exit(1);
}
