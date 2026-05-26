/**
 * Packaging script for the Prettier SQL VS Code extension.
 *
 * pnpm manages bundled/node_modules as workspace symlinks which vsce (yazl)
 * cannot include in a VSIX zip. This script:
 *   1. Uses `cp -rL` to copy bundled/node_modules into a temp dir OUTSIDE the
 *      extension directory, dereferencing all symlinks → real files.
 *   2. Prunes development-only files (src/, tests/, docs/, *.ts, *.md, etc.)
 *      from the copied plugin directories to keep the VSIX size reasonable.
 *   3. Swaps the real copy in place of the symlinked node_modules (backup is
 *      stored outside the extension so vsce never sees it).
 *   4. Runs `vsce package` to build the VSIX.
 *   5. Restores the original symlinked node_modules.
 *
 * Usage (from extensions/vscode-sql/):
 *   node scripts/pack.mjs
 */

import { existsSync, readdirSync, rmSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // extensions/vscode-sql/
const bundledDir = join(root, 'bundled');
const bundledModules = join(bundledDir, 'node_modules');

// Use OS temp dir for the backup so vsce never sees it
const tmp = join(tmpdir(), `prettier-sql-vsce-${Date.now()}`);
const backup = join(tmp, 'node_modules.bak');
const stage = join(tmp, 'node_modules');

// Sanity check: pnpm workspace install must have run first
if (!existsSync(bundledModules)) {
    console.error(
        'ERROR: bundled/node_modules not found.\n' +
        'Run `pnpm install` from the monorepo root first.',
    );
    process.exit(1);
}

// ── 1. Copy with symlink dereferencing ───────────────────────────────────────
console.log('Copying bundled/node_modules (dereferencing symlinks)…');
execSync(`mkdir -p "${tmp}"`);
execSync(`cp -rL "${bundledModules}" "${stage}"`, { stdio: 'inherit' });

// ── 2. Prune dev-only files from SQL plugin packages ─────────────────────────
// We keep: dist/, bin/dotnet/, package.json, node_modules/
// We drop: src/, tests/, docs/, scripts/, *.md, *.ts (non-dist), *.mjs probes
const KEEP = new Set(['dist', 'bin', 'package.json', 'node_modules']);
const PRUNE_PATTERNS = ['src', 'tests', 'docs', 'scripts', '.github'];

for (const pkg of ['prettier-plugin-tsql', 'prettier-plugin-postgresql']) {
    const pkgDir = join(stage, pkg);
    if (!existsSync(pkgDir)) continue;
    let savedBytes = 0;
    for (const entry of readdirSync(pkgDir)) {
        if (KEEP.has(entry)) continue;
        if (PRUNE_PATTERNS.includes(entry) || entry.endsWith('.md') || entry.endsWith('.mjs') && entry.startsWith('test')) {
            const full = join(pkgDir, entry);
            try {
                const before = Number(execSync(`du -sk "${full}" 2>/dev/null | cut -f1`).toString().trim()) * 1024;
                rmSync(full, { recursive: true, force: true });
                savedBytes += before;
            } catch { /* ignore */ }
        }
    }
    if (savedBytes > 0) {
        console.log(`  Pruned ${pkg}: saved ~${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
    }
}

// ── 3. Swap: symlinked tree → backup, staged real files → node_modules ───────
renameSync(bundledModules, backup);
renameSync(stage, bundledModules);

// ── 4. Run vsce package ───────────────────────────────────────────────────────
let exitCode = 0;
try {
    console.log('Running vsce package…');
    execSync('npx vsce package', { cwd: root, stdio: 'inherit' });
} catch (e) {
    exitCode = (e instanceof Error && 'status' in e) ? (e.status ?? 1) : 1;
} finally {
    // ── 5. Always restore the pnpm-managed symlinked node_modules ────────────
    rmSync(bundledModules, { recursive: true, force: true });
    renameSync(backup, bundledModules);
    rmSync(tmp, { recursive: true, force: true });
    console.log('Restored bundled/node_modules.');
}

process.exit(exitCode);
