/**
 * Format examples/test.sql using the locally built plugin.
 * Usage: node scripts/format-sql.mjs [path]   (default: examples/test.sql)
 */
import prettier from 'prettier';
import plugin from '../dist/index.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, '..', process.argv[2] ?? 'examples/test.sql');

const sql = readFileSync(target, 'utf8');

// Merge any .prettierrc settings alongside the plugin
const fileConfig = (await prettier.resolveConfig(target)) ?? {};

const formatted = await prettier.format(sql, {
    ...fileConfig,
    parser: 'tsql',
    plugins: [plugin],
});

writeFileSync(target, formatted);
console.log(`formatted: ${target}`);
