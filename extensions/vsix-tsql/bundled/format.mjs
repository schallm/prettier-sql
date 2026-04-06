/**
 * Formatting shim invoked by the VS extension.
 *
 * Reads SQL from stdin, formats it with prettier-plugin-tsql, writes result to stdout.
 * Options are passed as a JSON string in the first CLI argument.
 *
 * Exit codes:
 *   0 — success
 *   1 — formatting error (message on stderr)
 *   2 — parse/usage error
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Always use the bundled copies, regardless of any project node_modules
const prettierPath = join(__dirname, 'node_modules', 'prettier');
const pluginPath = join(__dirname, 'node_modules', 'prettier-plugin-tsql');

let prettier, plugin;
try {
    prettier = await import(prettierPath + '/index.mjs');
    plugin = require(pluginPath);
} catch (e) {
    process.stderr.write(`Failed to load dependencies: ${e.message}\n`);
    process.exit(2);
}

// Parse options from first argument (JSON), fall back to defaults
let userOptions = {};
if (process.argv[2]) {
    try {
        userOptions = JSON.parse(process.argv[2]);
    } catch {
        process.stderr.write('Invalid options JSON\n');
        process.exit(2);
    }
}

// Read SQL from stdin
let input;
try {
    input = readFileSync(0, 'utf-8');
} catch (e) {
    process.stderr.write(`Failed to read stdin: ${e.message}\n`);
    process.exit(2);
}

// Format
try {
    const result = await prettier.format(input, {
        parser: 'tsql',
        plugins: [plugin],
        printWidth: 120,
        tabWidth: 4,
        ...userOptions,
    });
    process.stdout.write(result);
} catch (e) {
    process.stderr.write(`Formatting error: ${e.message}\n`);
    process.exit(1);
}
