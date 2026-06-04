/**
 * Probe 23b — diagnose cursor variable bugs
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');

async function fmt(sql) {
    try {
        return await prettier.format(sql, {
            parser: 'tsql',
            plugins: [pluginPath],
            printWidth: 120,
        });
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function parse(sql) {
    // Use prettier's parse step to get the AST
    const result = await prettier.format(sql, {
        parser: 'tsql',
        plugins: [pluginPath],
        printWidth: 120,
    });
    return result;
}

// Check cursor variable declaration
console.log('=== declare @cur cursor ===');
console.log(await fmt('declare @cur cursor'));

console.log('=== declare @cur cursor for select id from T ===');
console.log(await fmt('declare @cur cursor for select id from T'));

console.log('=== set @cur = cursor for select id from T ===');
console.log(await fmt('set @cur = cursor for select id from T'));

// Check the AST for declare @cur cursor
const plugin = (await import(pluginPath)).default;
const parseResult = plugin.parsers.tsql.parse('declare @cur cursor', [plugin], {});
console.log('\n=== AST for declare @cur cursor ===');
const stmt = parseResult.body[0];
console.log(JSON.stringify(stmt, null, 2));

console.log('\n=== AST for set @cur = cursor for select id from T ===');
const setResult = plugin.parsers.tsql.parse('set @cur = cursor for select id from T', [plugin], {});
const setStmt = setResult.body[0];
console.log(JSON.stringify(setStmt, null, 2));
