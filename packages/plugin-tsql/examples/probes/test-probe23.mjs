/**
 * Probe 23 — Cursors, SET options, linked server, CLR, Service Broker message types
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

function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function check(label, input, mustContain) {
    return { label, input, mustContain };
}

const cases = [
    // ── CURSORS ──────────────────────────────────────────────────────────────
    check(
        'cursor_basic',
        `declare myCursor cursor for select id, name from dbo.Products where IsActive = 1`,
        ['declare', 'mycursor', 'cursor', 'for', 'select', 'id', 'name', 'dbo.products', 'isactive']
    ),
    check(
        'cursor_full_options',
        `declare myCursor cursor local static read_only forward_only for select id from dbo.T`,
        ['local', 'static', 'read_only', 'forward_only']
    ),
    check(
        'cursor_global_keyset',
        `declare myCursor cursor global keyset scroll for select id from T`,
        ['global', 'keyset', 'scroll']
    ),
    check(
        'cursor_dynamic_optimistic',
        `declare myCursor cursor dynamic optimistic for select id from T`,
        ['dynamic', 'optimistic']
    ),
    check(
        'cursor_scroll_locks',
        `declare myCursor cursor scroll_locks for select id from T`,
        ['scroll_locks']
    ),
    check(
        'cursor_open',
        `open myCursor`,
        ['open', 'mycursor']
    ),
    check(
        'cursor_fetch_next',
        `fetch next from myCursor into @id, @name`,
        ['fetch', 'next', 'from', 'mycursor', 'into', '@id', '@name']
    ),
    check(
        'cursor_fetch_prior',
        `fetch prior from myCursor into @id`,
        ['fetch', 'prior', 'from', 'mycursor', 'into', '@id']
    ),
    check(
        'cursor_fetch_first',
        `fetch first from myCursor into @id`,
        ['fetch', 'first']
    ),
    check(
        'cursor_fetch_last',
        `fetch last from myCursor into @id`,
        ['fetch', 'last']
    ),
    check(
        'cursor_fetch_absolute',
        `fetch absolute 5 from myCursor into @id`,
        ['fetch', 'absolute', '5', 'from', 'mycursor']
    ),
    check(
        'cursor_fetch_relative',
        `fetch relative -2 from myCursor into @id`,
        ['fetch', 'relative', '-2', 'from', 'mycursor']
    ),
    check(
        'cursor_close',
        `close myCursor`,
        ['close', 'mycursor']
    ),
    check(
        'cursor_deallocate',
        `deallocate myCursor`,
        ['deallocate', 'mycursor']
    ),
    check(
        'cursor_for_update_of',
        `declare myCursor cursor for select id, name from T for update of name`,
        ['for', 'update', 'of', 'name']
    ),
    check(
        'cursor_variable',
        `declare @cur cursor; set @cur = cursor for select id from T; open @cur; fetch next from @cur into @id; close @cur; deallocate @cur`,
        ['@cur', 'cursor', 'for', 'select', 'fetch', 'next', 'open', 'close', 'deallocate']
    ),

    // ── SET statements ────────────────────────────────────────────────────────
    check(
        'set_ansi_nulls',
        `set ansi_nulls on`,
        ['set', 'ansi_nulls', 'on']
    ),
    check(
        'set_ansi_nulls_off',
        `set ansi_nulls off`,
        ['set', 'ansi_nulls', 'off']
    ),
    check(
        'set_quoted_identifier',
        `set quoted_identifier on`,
        ['set', 'quoted_identifier', 'on']
    ),
    check(
        'set_nocount',
        `set nocount on`,
        ['set', 'nocount', 'on']
    ),
    check(
        'set_xact_abort',
        `set xact_abort on`,
        ['set', 'xact_abort', 'on']
    ),
    check(
        'set_implicit_transactions',
        `set implicit_transactions on`,
        ['set', 'implicit_transactions', 'on']
    ),
    check(
        'set_concat_null_yields_null',
        `set concat_null_yields_null off`,
        ['set', 'concat_null_yields_null', 'off']
    ),
    check(
        'set_ansi_padding',
        `set ansi_padding on`,
        ['set', 'ansi_padding', 'on']
    ),
    check(
        'set_ansi_warnings',
        `set ansi_warnings on`,
        ['set', 'ansi_warnings', 'on']
    ),
    check(
        'set_arithmetic_abort',
        `set arithabort on`,
        ['set', 'arithabort', 'on']
    ),
    check(
        'set_numeric_roundabort',
        `set numeric_roundabort off`,
        ['set', 'numeric_roundabort', 'off']
    ),
    check(
        'set_transaction_isolation_level',
        `set transaction isolation level read uncommitted`,
        ['set', 'transaction', 'isolation', 'level', 'read', 'uncommitted']
    ),
    check(
        'set_transaction_isolation_snapshot',
        `set transaction isolation level snapshot`,
        ['set', 'transaction', 'isolation', 'level', 'snapshot']
    ),
    check(
        'set_lock_timeout',
        `set lock_timeout 5000`,
        ['set', 'lock_timeout', '5000']
    ),
    check(
        'set_rowcount',
        `set rowcount 100`,
        ['set', 'rowcount', '100']
    ),
    check(
        'set_textsize',
        `set textsize 8192`,
        ['set', 'textsize', '8192']
    ),
    check(
        'set_dateformat',
        `set dateformat mdy`,
        ['set', 'dateformat', 'mdy']
    ),
    check(
        'set_datefirst',
        `set datefirst 7`,
        ['set', 'datefirst', '7']
    ),
    check(
        'set_language',
        `set language 'us_english'`,
        ['set', 'language', 'us_english']
    ),

    // ── Linked server four-part names ─────────────────────────────────────────
    check(
        'linked_server_select',
        `select * from LinkedServer.RemoteDb.dbo.Orders where OrderDate > '2024-01-01'`,
        ['linkedserver', 'remotedb', 'dbo', 'orders', 'orderdate']
    ),
    check(
        'linked_server_insert',
        `insert into LinkedSrv.RemoteDb.dbo.Archive select * from dbo.Orders`,
        ['linkedsrv', 'remotedb', 'dbo', 'archive']
    ),
    check(
        'openquery',
        `select * from openquery(LinkedServer, 'select id, name from dbo.Products')`,
        ['openquery', 'linkedserver', 'select id, name']
    ),
    check(
        'openrowset',
        `select * from openrowset('SQLNCLI', 'Server=MyServer;Trusted_Connection=yes;', 'select * from MyDb.dbo.T')`,
        ['openrowset', 'sqlncli', 'myserver']
    ),

    // ── EXECUTE AS / REVERT ───────────────────────────────────────────────────
    check(
        'execute_as_user',
        `execute as user = 'domain\\user'`,
        ['execute', 'as', 'user', 'domain\\\\user']
    ),
    check(
        'execute_as_login',
        `execute as login = 'sa'`,
        ['execute', 'as', 'login', 'sa']
    ),
    check(
        'execute_as_caller',
        `execute as caller`,
        ['execute', 'as', 'caller']
    ),
    check(
        'revert',
        `revert`,
        ['revert']
    ),
    check(
        'revert_with_cookie',
        `revert with cookie = @cookie`,
        ['revert', 'with', 'cookie', '@cookie']
    ),

    // ── ALTER DATABASE SET options ────────────────────────────────────────────
    check(
        'alter_db_recovery_full',
        `alter database MyDb set recovery full`,
        ['alter', 'database', 'mydb', 'set', 'recovery', 'full']
    ),
    check(
        'alter_db_recovery_simple',
        `alter database MyDb set recovery simple`,
        ['recovery', 'simple']
    ),
    check(
        'alter_db_enable_broker',
        `alter database MyDb set enable_broker`,
        ['enable_broker']
    ),
    check(
        'alter_db_single_user',
        `alter database MyDb set single_user with rollback immediate`,
        ['single_user', 'rollback', 'immediate']
    ),
    check(
        'alter_db_multi_user',
        `alter database MyDb set multi_user`,
        ['multi_user']
    ),
    check(
        'alter_db_read_only',
        `alter database MyDb set read_only`,
        ['read_only']
    ),
    check(
        'alter_db_modify_file',
        `alter database MyDb modify file (name = MyDb_data, size = 100mb)`,
        ['modify', 'file', 'name', 'mydb_data', 'size', '100']
    ),
    check(
        'alter_db_add_filegroup',
        `alter database MyDb add filegroup NewGroup`,
        ['add', 'filegroup', 'newgroup']
    ),

    // ── Service Broker message types ──────────────────────────────────────────
    check(
        'create_message_type_none',
        `create message type [OrderMsg] validation = none`,
        ['create', 'message', 'type', 'ordermsg', 'validation', 'none']
    ),
    check(
        'create_message_type_empty',
        `create message type [OrderMsg] validation = empty`,
        ['create', 'message', 'type', 'validation', 'empty']
    ),
    check(
        'create_message_type_well_formed',
        `create message type [OrderMsg] validation = well_formed_xml`,
        ['well_formed_xml']
    ),
    check(
        'create_contract',
        `create contract [OrderContract] ([OrderMsg] sent by initiator)`,
        ['create', 'contract', 'ordercontract', 'ordermsg', 'sent', 'by', 'initiator']
    ),
    check(
        'create_queue',
        `create queue dbo.OrderQueue with status = on, retention = off`,
        ['create', 'queue', 'dbo', 'orderqueue', 'status', 'retention']
    ),
    check(
        'create_service',
        `create service [OrderService] on queue dbo.OrderQueue ([OrderContract])`,
        ['create', 'service', 'orderservice', 'on', 'queue', 'orderqueue', 'ordercontract']
    ),

    // ── WAITFOR ───────────────────────────────────────────────────────────────
    check(
        'waitfor_delay',
        `waitfor delay '00:00:05'`,
        ['waitfor', 'delay', '00:00:05']
    ),
    check(
        'waitfor_time',
        `waitfor time '23:59:00'`,
        ['waitfor', 'time', '23:59:00']
    ),

    // ── BULK INSERT ───────────────────────────────────────────────────────────
    check(
        'bulk_insert',
        `bulk insert dbo.Orders from 'C:\\data\\orders.csv' with (fieldterminator = ',', rowterminator = '\n', firstrow = 2)`,
        ['bulk', 'insert', 'dbo.orders', 'fieldterminator', 'rowterminator', 'firstrow', '2']
    ),

    // ── THROW / RAISERROR ────────────────────────────────────────────────────
    check(
        'throw_with_args',
        `throw 50001, N'Record not found', 1`,
        ['throw', '50001', 'record not found', '1']
    ),
    check(
        'raiserror_with_log',
        `raiserror ('Critical error', 20, 1) with log`,
        ['raiserror', 'critical error', '20', '1', 'with', 'log']
    ),
    check(
        'raiserror_nowait',
        `raiserror ('Msg', 10, 1) with nowait`,
        ['raiserror', 'nowait']
    ),

    // ── PRINT ─────────────────────────────────────────────────────────────────
    check(
        'print_literal',
        `print 'Hello, World!'`,
        ['print', 'hello, world!']
    ),
    check(
        'print_variable',
        `print @message`,
        ['print', '@message']
    ),
    check(
        'print_expression',
        `print 'Count: ' + cast(@n as varchar(10))`,
        ['print', 'count:', '@n', 'varchar']
    ),
];

let pass = 0;
let fail = 0;
const failures = [];

for (const { label, input, mustContain } of cases) {
    const out = await fmt(input);
    const outNorm = normalize(out);
    const missing = mustContain.filter(kw => !outNorm.includes(kw.toLowerCase()));
    if (missing.length === 0) {
        pass++;
    } else {
        fail++;
        failures.push({ label, input, out: out.trim(), missing });
    }
}

console.log(`\nProbe 23 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 200)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
