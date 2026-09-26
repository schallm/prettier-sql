/**
 * Manual local release: the fallback for publishing outside CI (see RELEASING.md).
 *
 *   1. Makes sure you're logged in to npm (runs `npm login` if not).
 *   2. Runs `changeset version` if there are pending changesets. Since
 *      @changesets/cli 3.0 it exits 1 when there are none, so it's skipped then,
 *      e.g. when re-running after a failed publish.
 *   3. Builds all packages.
 *   4. Publishes with `changeset publish`, which skips versions already on npm.
 *
 * Usage (from the repo root):
 *   pnpm release
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const changesetDir = join(root, '.changeset');

function run(cmd) {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
}

try {
    execSync('npm whoami --registry https://registry.npmjs.org', { cwd: root, stdio: ['ignore', 'inherit', 'ignore'] });
} catch {
    run('npm login --registry https://registry.npmjs.org');
}

const pending = existsSync(changesetDir)
    ? readdirSync(changesetDir).filter((f) => f.endsWith('.md') && f !== 'README.md')
    : [];

if (pending.length > 0) {
    run('pnpm changeset version');
} else {
    console.log('No pending changesets, skipping `changeset version`.');
}

run('pnpm -r --sequential build');
run('pnpm changeset publish');
