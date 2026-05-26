/**
 * Formatting entry point for the Prettier SQL VS Code extension.
 *
 * Delegates to the shared format-core.mjs with the appropriate plugin,
 * selected by the dialect argument passed by extension.ts.
 *
 * argv[2] — optional JSON string of Prettier option overrides
 * argv[3] — optional file path for .prettierrc resolution
 * argv[4] — dialect: 'tsql' (default) | 'pgsql'
 *
 * Exit codes: 0 = success, 1 = formatting error, 2 = parse/usage error
 */

import { runFormat } from '../../shared/format-core.mjs';

const dialect = process.argv[4] ?? 'tsql';
const pluginName =
    dialect === 'pgsql' ? 'prettier-plugin-postgresql' : 'prettier-plugin-tsql';
const parser = dialect; // plugin parser names match dialect names

await runFormat({ callerUrl: import.meta.url, pluginName, parser });
