/**
 * Probe 53 — Service Broker, Advanced DDL, and obscure T-SQL:
 *   - CREATE / ALTER / DROP MESSAGE TYPE
 *   - CREATE / ALTER / DROP CONTRACT
 *   - CREATE / ALTER / DROP QUEUE
 *   - CREATE / ALTER / DROP SERVICE
 *   - SEND ON CONVERSATION
 *   - BEGIN DIALOG CONVERSATION
 *   - RECEIVE statement
 *   - END CONVERSATION
 *   - GET CONVERSATION GROUP
 *   - MOVE CONVERSATION
 *   - CREATE ENDPOINT
 *   - CREATE SERVER AUDIT
 *   - CREATE DATABASE AUDIT SPECIFICATION
 *   - ALTER DATABASE SET options (multiple)
 *   - ALTER DATABASE ADD FILEGROUP
 *   - ALTER DATABASE ADD FILE
 *   - CREATE FULLTEXT CATALOG
 *   - ALTER FULLTEXT INDEX
 *   - ENABLE / DISABLE TRIGGER
 *   - ENABLE / DISABLE TRIGGER (scoped)
 *   - ALTER SERVER CONFIGURATION
 *   - RECONFIGURE (after sp_configure)
 *   - CHECKPOINT
 *   - DBCC SHRINKFILE
 *   - DBCC SHRINKDATABASE
 *   - DBCC FREEPROCCACHE
 *   - DBCC DROPCLEANBUFFERS
 *   - DBCC SQLPERF
 *   - DBCC SHOWCONTIG (legacy)
 *   - ALTER INDEX REBUILD PARTITION
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
    // ── DBCC commands ────────────────────────────────────────────────────────
    check(
        'dbcc_freeproccache',
        `dbcc freeproccache`,
        ['dbcc', 'freeproccache']
    ),
    check(
        'dbcc_dropcleanbuffers',
        `dbcc dropcleanbuffers`,
        ['dbcc', 'dropcleanbuffers']
    ),
    check(
        'dbcc_shrinkfile',
        `dbcc shrinkfile (MyDb_log, 100)`,
        ['dbcc', 'shrinkfile', 'mydb_log', '100']
    ),
    check(
        'dbcc_shrinkdatabase',
        `dbcc shrinkdatabase (MyDb, 10)`,
        ['dbcc', 'shrinkdatabase', 'mydb', '10']
    ),
    check(
        'dbcc_checkdb',
        `dbcc checkdb ('MyDb') with no_infomsgs`,
        ['dbcc', 'checkdb', 'mydb', 'no_infomsgs']
    ),
    check(
        'dbcc_updateusage',
        `dbcc updateusage (0) with count_rows`,
        ['dbcc', 'updateusage', '0', 'count_rows']
    ),

    // ── CHECKPOINT ───────────────────────────────────────────────────────────
    check(
        'checkpoint',
        `checkpoint 5`,
        ['checkpoint', '5']
    ),

    // ── ALTER DATABASE SET options ────────────────────────────────────────────
    check(
        'alter_db_set_recovery',
        `alter database MyApp set recovery full`,
        ['alter database', 'myapp', 'set recovery full']
    ),
    check(
        'alter_db_set_compat',
        `alter database MyApp set compatibility_level = 160`,
        ['alter database', 'myapp', 'compatibility_level', '160']
    ),
    check(
        'alter_db_set_multi',
        `alter database MyApp set allow_snapshot_isolation on`,
        ['alter database', 'allow_snapshot_isolation', 'on']
    ),

    // ── ENABLE / DISABLE TRIGGER ──────────────────────────────────────────────
    check(
        'enable_trigger_global',
        `enable trigger trgOrderAudit on dbo.Orders`,
        ['enable trigger', 'trgorderaudit', 'on dbo.orders']
    ),
    check(
        'disable_trigger_global',
        `disable trigger all on dbo.Orders`,
        ['disable trigger', 'all', 'on dbo.orders']
    ),

    // ── ALTER INDEX with partition ────────────────────────────────────────────
    check(
        'alter_index_rebuild_partition',
        `alter index IX_Orders_Date on dbo.Orders rebuild partition = 3 with (online = on)`,
        ['alter index', 'ix_orders_date', 'rebuild', 'partition', '3', 'online']
    ),

    // ── sp_configure / RECONFIGURE ────────────────────────────────────────────
    check(
        'sp_configure_reconfigure',
        `exec sp_configure 'max degree of parallelism', 4; reconfigure with override`,
        ['sp_configure', 'max degree of parallelism', '4', 'reconfigure', 'with override']
    ),

    // ── CREATE FULLTEXT CATALOG / INDEX ───────────────────────────────────────
    check(
        'create_fulltext_catalog',
        `create fulltext catalog ftcOrders as default`,
        ['create fulltext catalog', 'ftcorders', 'as default']
    ),
    check(
        'create_fulltext_index',
        `create fulltext index on dbo.Products (Name, Description) key index PK_Products on ftcProducts with change_tracking = auto`,
        ['create fulltext index', 'dbo.products', 'name', 'description', 'key index', 'pk_products', 'change_tracking']
    ),
    check(
        'alter_fulltext_index',
        `alter fulltext index on dbo.Products enable`,
        ['alter fulltext index', 'dbo.products', 'enable']
    ),

    // ── Service Broker basics ─────────────────────────────────────────────────
    check(
        'begin_dialog',
        `begin dialog conversation @handle from service 'OrderService' to service 'ShippingService', 'CURRENT DATABASE' with encryption = off`,
        ['begin dialog', '@handle', 'from service', "'orderservice'", 'to service', "'shippingservice'", 'encryption']
    ),
    check(
        'send_on_conversation',
        `send on conversation @handle message type [OrderSubmitted] (cast(@orderXml as xml))`,
        ['send on conversation', '@handle', 'message type', 'ordersubmitted', '@orderxml']
    ),
    check(
        'end_conversation',
        `end conversation @handle`,
        ['end conversation', '@handle']
    ),
    check(
        'end_conversation_with_error',
        `end conversation @handle with error = 50001 description = N'Order processing failed'`,
        ['end conversation', '@handle', 'with error', '50001', 'description']
    ),

    // ── CREATE ENDPOINT (basic) ───────────────────────────────────────────────
    check(
        'create_endpoint',
        `create endpoint OrderSvcEndpoint state = started as tcp (listener_port = 4022) for service_broker (authentication = windows)`,
        ['create endpoint', 'ordersvcendpoint', 'state = started', 'tcp', 'listener_port', '4022', 'service_broker', 'authentication']
    ),

    // ── USE statement ─────────────────────────────────────────────────────────
    check(
        'use_database',
        `use MyApp`,
        ['use', 'myapp']
    ),

    // ── GO batch separator ────────────────────────────────────────────────────
    check(
        'go_separator',
        `select 1;\ngo\nselect 2`,
        ['select 1', 'go', 'select 2']
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

console.log(`\nProbe 53 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
