import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');
const plugin = (await import(pluginPath)).default;

function parse(sql) {
    return plugin.parsers.tsql.parse(sql, [plugin], {});
}

const ast = parse(`create table dbo.T (
    Id int not null constraint PK_T primary key,
    OtherId int not null constraint FK_T_Other foreign key references dbo.Other(Id) on delete cascade,
    ThirdId int not null constraint FK_T_Third references dbo.Third(Id)
)`);
const cols = ast.props.batches[0].props.statements[0].props.columns;
for (const col of cols) {
    console.log(`\n=== Column: ${col.text} ===`);
    console.log(JSON.stringify(col.props?.foreignKey, null, 2));
}
