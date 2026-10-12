import { it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// The package is built on one machine (Linux, in CI) and used on others: libpg_query for each
// platform has to ship under bin/dotnet/runtimes, where NativeLibraries looks for it.
const binDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'dotnet');

it.each([
    ['linux-x64', 'libpg_query.so'],
    ['osx-x64', 'libpg_query.dylib'],
    ['osx-arm64', 'libpg_query.dylib'],
    ['win-x64', 'libpg_query.dll'],
])('ships libpg_query for %s', (rid, file) => {
    expect(existsSync(join(binDir, 'runtimes', rid, 'native', file))).toBe(true);
});
