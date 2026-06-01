/**
 * Post-build script: copies @prettier-sql/core compiled files into dist/_core/
 * and rewrites all import specifiers so the published npm package is
 * self-contained — no runtime dependency on a workspace-only package.
 *
 * Run after `tsc -p tsconfig.json`.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDist = join(__dirname, '../dist');
const coreDist = join(__dirname, '../../../packages/core/dist');

// ---------------------------------------------------------------------------
// 1. Copy core dist files into dist/_core/
// ---------------------------------------------------------------------------

mkdirSync(join(pluginDist, '_core/printer'), { recursive: true });
mkdirSync(join(pluginDist, '_core/parser'), { recursive: true });

const filesToCopy = [
    ['options.js', '_core/options.js'],
    ['types.js', '_core/types.js'],
    ['printer/helpers.js', '_core/printer/helpers.js'],
    ['printer/utils.js', '_core/printer/utils.js'],
    ['parser/loadDotnet.js', '_core/parser/loadDotnet.js'],
];

for (const [src, dest] of filesToCopy) {
    copyFileSync(join(coreDist, src), join(pluginDist, dest));
}

// ---------------------------------------------------------------------------
// 2. Rewrite @prettier-sql/core/* imports in every dist .js file
// ---------------------------------------------------------------------------

/**
 * Returns the relative path from `fromDir` to `pluginDist/_core/`,
 * normalised to forward slashes and prefixed with `./` if needed.
 */
function corePrefix(fromDir) {
    const rel = relative(fromDir, join(pluginDist, '_core')).replace(/\\/g, '/');
    return rel.startsWith('.') ? rel : './' + rel;
}

const REPLACEMENTS = [
    ['@prettier-sql/core/options', (p) => `${p}/options.js`],
    ['@prettier-sql/core/types', (p) => `${p}/types.js`],
    ['@prettier-sql/core/printer/utils', (p) => `${p}/printer/utils.js`],
    ['@prettier-sql/core/printer/helpers', (p) => `${p}/printer/helpers.js`],
    ['@prettier-sql/core/parser', (p) => `${p}/parser/loadDotnet.js`],
];

function patchFile(filePath) {
    let content = readFileSync(filePath, 'utf8');
    const prefix = corePrefix(dirname(filePath));
    let changed = false;
    for (const [specifier, resolver] of REPLACEMENTS) {
        const resolved = resolver(prefix);
        // Match both single-quoted and double-quoted import specifiers
        const single = `'${specifier}'`;
        const double = `"${specifier}"`;
        if (content.includes(single) || content.includes(double)) {
            content = content.replaceAll(single, `'${resolved}'`).replaceAll(double, `"${resolved}"`);
            changed = true;
        }
    }
    if (changed) writeFileSync(filePath, content, 'utf8');
}

function walkAndPatch(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry !== '_core') walkAndPatch(full); // skip the dir we just created
        } else if (entry.endsWith('.js') && !entry.endsWith('.map')) {
            patchFile(full);
        }
    }
}

walkAndPatch(pluginDist);

console.log('bundle-core: @prettier-sql/core inlined into dist/_core/');
