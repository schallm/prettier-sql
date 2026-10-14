import { it, expect } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// The package is built on one machine (Linux, in CI) and used on others: libpg_query for each
// platform has to ship under bin/dotnet/runtimes, where NativeLibraries looks for it.
const binDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'dotnet');

const platforms = [
    ['linux-x64', 'libpg_query.so'],
    ['osx-x64', 'libpg_query.dylib'],
    ['osx-arm64', 'libpg_query.dylib'],
    ['win-x64', 'libpg_query.dll'],
];

it.each(platforms)('ships libpg_query for %s', (rid, file) => {
    expect(existsSync(join(binDir, 'runtimes', rid, 'native', file))).toBe(true);
});

// pgsqlparser has builds for more platforms than NativeLibraries loads; the build leaves them out
it('ships libpg_query only for the platforms NativeLibraries loads', () => {
    expect(readdirSync(join(binDir, 'runtimes')).sort()).toEqual(platforms.map(([rid]) => rid).sort());
});
