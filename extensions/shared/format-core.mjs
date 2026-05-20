/**
 * Formatting shim invoked by VS extensions.
 *
 * Reads SQL from stdin, formats it with the configured plugin, writes result to stdout.
 * argv[2] — optional JSON string of Prettier option overrides
 * argv[3] — optional file path used to resolve the nearest .prettierrc / prettier.config.*
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

/**
 * @param {{ callerUrl: string, pluginName: string, parser: string }} config
 *   callerUrl  — import.meta.url of the calling bundled/format.mjs
 *   pluginName — npm package name of the SQL plugin (e.g. 'prettier-plugin-tsql')
 *   parser     — Prettier parser name (e.g. 'tsql')
 */
export async function runFormat({ callerUrl, pluginName, parser }) {
    const bundledDir = dirname(fileURLToPath(callerUrl));
    const require = createRequire(callerUrl);

    // Always use the bundled copies, regardless of any project node_modules
    const prettierPath = join(bundledDir, 'node_modules', 'prettier');
    const pluginPath = join(bundledDir, 'node_modules', pluginName);

    let prettier, plugin;
    try {
        prettier = await import(prettierPath + '/index.mjs');
        plugin = require(pluginPath);
        plugin = plugin.default ?? plugin;
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

    // Resolve .prettierrc / prettier.config.* from the file's directory (argv[3])
    let configOptions = {};
    if (process.argv[3]) {
        try {
            configOptions = (await prettier.resolveConfig(process.argv[3])) ?? {};
        } catch {
            // ignore config resolution errors
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

    // Format — merge order: extension defaults < .prettierrc < explicit options arg
    try {
        const result = await prettier.format(input, {
            parser,
            plugins: [plugin],
            printWidth: 120,
            tabWidth: 4,
            ...configOptions,
            ...userOptions,
        });
        process.stdout.write(result);
    } catch (e) {
        process.stderr.write(`Formatting error: ${e.message}\n`);
        process.exit(1);
    }
}
