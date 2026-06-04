import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');
const plugin = (await import(pluginPath)).default;

function parse(sql) {
    return plugin.parsers.tsql.parse(sql, [plugin], {});
}

const ast = parse(`alter table dbo.SalesCurrent switch partition 3 to dbo.SalesArchive partition 1 with (wait_at_low_priority (max_duration = 10 minutes, abort_after_wait = self))`);
const stmt = ast.props.batches[0].props.statements[0];
console.log(JSON.stringify(stmt, null, 2));
