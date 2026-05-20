#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_NOTICES.txt from the licenses of all packages
 * installed in bundled/node_modules.
 *
 * Usage: node ../../shared/generate-notices.mjs --dialect "T-SQL"
 *        node ../../shared/generate-notices.mjs --dialect "PostgreSQL"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const dialectIndex = process.argv.indexOf('--dialect');
if (dialectIndex === -1 || !process.argv[dialectIndex + 1]) {
    process.stderr.write('Usage: generate-notices.mjs --dialect <name>\n');
    process.exit(1);
}
const dialect = process.argv[dialectIndex + 1];

// Script resolves paths relative to cwd, which must be the vsix package directory
const callerDir = process.cwd();
const nodeModulesDir = join(callerDir, 'bundled', 'node_modules');
const outputFile = join(callerDir, 'THIRD_PARTY_NOTICES.txt');

const LICENSE_FILE_NAMES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENCE', 'LICENCE.txt', 'COPYING'];

function findLicenseText(pkgDir) {
    for (const name of LICENSE_FILE_NAMES) {
        const p = join(pkgDir, name);
        if (existsSync(p)) return readFileSync(p, 'utf-8').trim();
    }
    // Fallback: read license field from package.json and emit generic MIT text
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
    if (pkg.license === 'MIT') {
        return `MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS\nIN THE SOFTWARE.`;
    }
    return `License: ${pkg.license ?? 'UNKNOWN'} (license file not found)`;
}

const packages = readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
        const pkgDir = join(nodeModulesDir, d.name);
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
        return {
            name: pkg.name ?? d.name,
            version: pkg.version ?? 'unknown',
            license: pkg.license ?? 'UNKNOWN',
            repository: typeof pkg.repository === 'string'
                ? pkg.repository
                : pkg.repository?.url ?? '',
            licenseText: findLicenseText(pkgDir),
        };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

const separator = '-'.repeat(72);

const lines = [
    'THIRD-PARTY SOFTWARE NOTICES AND INFORMATION',
    '',
    `This file contains the licenses for third-party software bundled with`,
    `the Prettier ${dialect} Visual Studio extension.`,
    '',
    separator,
    '',
];

for (const pkg of packages) {
    lines.push(`Package:    ${pkg.name}`);
    lines.push(`Version:    ${pkg.version}`);
    lines.push(`License:    ${pkg.license}`);
    if (pkg.repository) lines.push(`Repository: ${pkg.repository}`);
    lines.push('');
    lines.push(pkg.licenseText);
    lines.push('');
    lines.push(separator);
    lines.push('');
}

writeFileSync(outputFile, lines.join('\n'), 'utf-8');
console.log(`Written: ${outputFile}`);
console.log(`Included ${packages.length} package(s): ${packages.map(p => p.name).join(', ')}`);
