/**
 * Probe 23c — get raw AST for cursor variable
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');

const plugin = (await import(pluginPath)).default;

function parse(sql) {
    return plugin.parsers.tsql.parse(sql, [plugin], {});
}

// Cursor data type
console.log('=== declare @cur cursor AST ===');
const r1 = parse('declare @cur cursor');
console.log(JSON.stringify(r1, null, 2));

console.log('\n=== set @cur = cursor for select id from T ===');
const r2 = parse('set @cur = cursor for select id from T');
console.log(JSON.stringify(r2, null, 2));
