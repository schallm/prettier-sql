import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(__dirname, 'dist/index.js');

async function fmt(sql) {
    try {
        return await prettier.format(sql, { parser: 'tsql', plugins: [pluginPath], printWidth: 120 });
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

// Try various forms
console.log(await fmt(`alter table dbo.Orders drop constraint PK_Orders with (online = on, wait_at_low_priority (max_duration = 5 minutes, abort_after_wait = self))`));
console.log(await fmt(`alter table dbo.Orders drop constraint PK_Orders with (wait_at_low_priority (max_duration = 5 minutes, abort_after_wait = self))`));
console.log(await fmt(`alter table dbo.Orders drop constraint PK_Orders with (maxdop = 4)`));
console.log(await fmt(`alter table dbo.BigTable drop constraint CL_BigTable with (online = on, maxdop = 4)`));
