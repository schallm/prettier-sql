import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');
const plugin = (await import(pluginPath)).default;

function parse(sql) {
    return plugin.parsers.tsql.parse(sql, [plugin], {});
}

const ast = parse('create table dbo.T (Id int not null primary key, Data xml(dbo.MySchema) not null)');
const colDefs = ast.props.batches[0].props.statements[0].props.columns;
console.log('Columns:', JSON.stringify(colDefs, null, 2));
