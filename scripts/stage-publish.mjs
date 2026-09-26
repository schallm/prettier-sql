/**
 * Stages every public workspace package whose current version is not yet on npm.
 *
 * CI runs this instead of `changeset publish`: the npm trusted publishers for these
 * packages only allow `npm stage publish`, so each release sits on npmjs.com until a
 * maintainer approves it with 2FA (see RELEASING.md).
 *
 * For each package in packages/* that isn't private:
 *   1. Skips it if `name@version` is already published.
 *   2. Packs it with `pnpm pack`, which rewrites `workspace:*` specifiers.
 *   3. Stages the tarball with `npm stage publish`.
 *   4. Creates a `name@version` git tag and prints `New tag: name@version`, the line
 *      changesets/action looks for to push tags and create GitHub releases.
 *
 * Usage (from the repo root, after building):
 *   node scripts/stage-publish.mjs
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesDir = join(root, 'packages');

function run(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
}

function isPublished(name, version) {
    try {
        return run('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] }) === version;
    } catch {
        // npm view exits non-zero (E404) when the version doesn't exist.
        return false;
    }
}

const failed = [];

for (const dir of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, dir);
    const manifestPath = join(pkgDir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const { name, version, private: isPrivate } = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (isPrivate) continue;

    const spec = `${name}@${version}`;
    if (isPublished(name, version)) {
        console.log(`${spec} is already published, skipping`);
        continue;
    }

    const packDir = mkdtempSync(join(tmpdir(), 'stage-publish-'));
    try {
        run('pnpm', ['pack', '--pack-destination', packDir], { cwd: pkgDir });
        const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
        if (!tarball) throw new Error(`pnpm pack produced no tarball in ${packDir}`);

        console.log(`Staging ${spec}…`);
        execFileSync('npm', ['stage', 'publish', join(packDir, tarball)], { cwd: pkgDir, stdio: 'inherit' });

        run('git', ['tag', spec], { cwd: root });
        console.log(`New tag: ${spec}`);
    } catch (e) {
        console.error(`Failed to stage ${spec}: ${e instanceof Error ? e.message : String(e)}`);
        failed.push(spec);
    } finally {
        rmSync(packDir, { recursive: true, force: true });
    }
}

if (failed.length > 0) {
    console.error(`\nFailed to stage: ${failed.join(', ')}`);
    process.exit(1);
}
