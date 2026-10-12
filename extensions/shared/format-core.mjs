/**
 * Formatting shim invoked by VS extensions.
 *
 * Reads SQL from stdin, formats it with the configured plugin, writes result to stdout.
 * argv[2] — optional JSON string of Prettier option overrides; its `defaults` entry holds
 *           options that only apply where the project's .prettierrc doesn't set them (an
 *           editor's own settings), and rangeStart / rangeEnd format just those statements
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

    // Format — merge order: extension defaults < editor settings (`defaults`) < .prettierrc <
    // explicit options arg. The
    // bundled plugin and its parser always win: a project's .prettierrc usually lists the
    // plugin by name (as its README says to), which would resolve from the wrong place.
    const { rangeStart, rangeEnd, defaults = {}, ...explicitOptions } = userOptions;
    const options = {
        printWidth: 120,
        tabWidth: 4,
        // Keep the file's own line endings (CRLF in most Windows projects)
        endOfLine: 'auto',
        ...defaults,
        ...configOptions,
        ...explicitOptions,
        parser,
        plugins: [plugin],
    };
    try {
        const result = rangeStart !== undefined || rangeEnd !== undefined
            ? await formatRange(prettier, plugin.parsers[parser], input, options, rangeStart ?? 0, rangeEnd ?? input.length)
            : await prettier.format(input, options);
        process.stdout.write(result);
    } catch (e) {
        process.stderr.write(`Formatting error: ${e.message}\n`);
        process.exit(1);
    }
}

/**
 * Formats the statements a selection touches and leaves the rest of the text as it was.
 * Prettier's own rangeStart / rangeEnd only work for its built-in languages: for a plugin
 * it returns the text unchanged. Returns the whole text, like prettier.format.
 *
 * @param {typeof import('prettier')} prettier
 * @param {import('prettier').Parser} sqlParser — the plugin's parser, for its statements' offsets
 * @param {string} text
 * @param {import('prettier').Options} options
 * @param {number} rangeStart — UTF-16 offsets, as editors and Prettier count them
 * @param {number} rangeEnd
 */
export async function formatRange(prettier, sqlParser, text, options, rangeStart, rangeEnd) {
    const ast = await sqlParser.parse(text, options);
    // T-SQL groups its statements in batches (split at GO); PostgreSQL lists them directly
    const statements = ast.props?.batches
        ? ast.props.batches.flatMap((b) => b.props?.statements ?? [])
        : (ast.props?.statements ?? []);
    // A statement touches the selection if they overlap — or, for an empty selection
    // (a cursor), if the cursor is inside or at either end of it
    const touched = statements.filter((s) => {
        const start = sqlParser.locStart(s);
        const end = sqlParser.locEnd(s);
        return rangeStart === rangeEnd ? start <= rangeStart && rangeStart <= end : start < rangeEnd && rangeStart < end;
    });
    if (touched.length === 0) return text;

    const start = sqlParser.locStart(touched[0]);
    let end = sqlParser.locEnd(touched.at(-1));
    // Take the statement's semicolon, which the formatted text ends with, and a GO line
    // after it, which the formatter adds after a CREATE PROCEDURE or VIEW
    end += /^[ \t]*;?/.exec(text.slice(end))[0].length;
    const go = /^[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*go(?:[ \t]+\d+)?[ \t]*(?=\r?\n|$)/i.exec(text.slice(end));
    if (go) end += go[0].length;

    const formatted = await prettier.format(text.slice(start, end), options);
    // The slice's formatted text ends with a line break; the text after the slice has its own
    return text.slice(0, start) + formatted.replace(/\r?\n$/, '') + text.slice(end);
}
