/**
 * Sets a package's bump type in every pending changeset that mentions it.
 *
 * Changesets releases a package at the highest bump across its pending changesets,
 * so rewriting all of them makes the given type the result — whether it's higher or
 * lower than before. Used by scripts/release.sh when you pick a different bump.
 *
 * Usage (from the repo root):
 *   node scripts/set-changeset-bump.mjs <package-name> <patch|minor|major>
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';

const [name, type] = process.argv.slice(2);
if (!name || !['patch', 'minor', 'major'].includes(type)) {
    console.error('Usage: node scripts/set-changeset-bump.mjs <package-name> <patch|minor|major>');
    process.exit(2);
}

const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A frontmatter entry for the package: "prettier-plugin-tsql": patch
const entry = new RegExp(`^(["']?${escaped}["']?\\s*:\\s*)(patch|minor|major)\\s*$`, 'm');

let changed = 0;
for (const file of readdirSync('.changeset')) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const path = `.changeset/${file}`;
    const text = readFileSync(path, 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter || !entry.test(frontmatter[1])) continue;
    const updated = frontmatter[1].replace(entry, `$1${type}`);
    writeFileSync(path, text.replace(frontmatter[0], `---\n${updated}\n---`));
    changed++;
}

console.log(`${name}: ${type} in ${changed} changeset(s)`);
