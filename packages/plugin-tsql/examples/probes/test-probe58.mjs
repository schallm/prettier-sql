/**
 * Probe 58 — ALTER statements, schema operations, and infrequently-used DDL:
 *   - ALTER TABLE ADD multiple columns in one statement
 *   - ALTER TABLE SWITCH PARTITION
 *   - ALTER TABLE REBUILD
 *   - ALTER DATABASE ... MODIFY FILE
 *   - ALTER DATABASE ... REMOVE FILE
 *   - ALTER DATABASE ... MODIFY FILEGROUP
 *   - ALTER SCHEMA TRANSFER
 *   - DROP SCHEMA
 *   - CREATE SCHEMA with objects
 *   - CREATE USER WITHOUT LOGIN
 *   - CREATE USER FROM CERTIFICATE
 *   - CREATE USER FROM EXTERNAL PROVIDER
 *   - DENY on object
 *   - REVOKE GRANT OPTION FOR
 *   - ALTER SERVER ROLE ADD MEMBER
 *   - CREATE SERVER ROLE
 *   - DROP SERVER ROLE
 *   - ALTER ASSEMBLY
 *   - DROP ASSEMBLY
 *   - CREATE AGGREGATE (CLR)
 *   - CREATE QUEUE
 *   - ALTER QUEUE
 *   - DROP QUEUE
 *   - DROP SERVICE
 *   - DROP CONTRACT
 *   - DROP MESSAGE TYPE
 *   - CREATE RESOURCE POOL
 *   - ALTER RESOURCE GOVERNOR
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
    // ── ALTER TABLE ADD multiple columns ─────────────────────────────────────
    check(
        'alter_table_add_columns',
        `alter table dbo.Orders add ShipDate datetime2 null, ShipMethod nvarchar(50) null default 'Ground', TrackingNumber nvarchar(100) null`,
        ['alter table', 'add', 'shipdate', 'datetime2', 'shipmethod', 'nvarchar', "'ground'", 'trackingnumber']
    ),

    // ── ALTER TABLE REBUILD ───────────────────────────────────────────────────
    check(
        'alter_table_rebuild',
        `alter table dbo.Orders rebuild with (online = on, data_compression = row)`,
        ['alter table', 'rebuild', 'online', 'data_compression', 'row']
    ),

    // ── ALTER TABLE SWITCH PARTITION ──────────────────────────────────────────
    check(
        'alter_table_switch',
        `alter table dbo.Orders switch partition 1 to dbo.OrdersArchive partition 1`,
        ['alter table', 'dbo.orders', 'switch partition', '1', 'to dbo.ordersarchive', 'partition 1']
    ),

    // ── ALTER SCHEMA TRANSFER ─────────────────────────────────────────────────
    check(
        'alter_schema_transfer',
        `alter schema sales transfer dbo.Orders`,
        ['alter schema', 'sales', 'transfer', 'dbo.orders']
    ),

    // ── DROP SCHEMA ───────────────────────────────────────────────────────────
    check(
        'drop_schema',
        `drop schema if exists reporting`,
        ['drop schema', 'if exists', 'reporting']
    ),

    // ── CREATE USER variants ──────────────────────────────────────────────────
    check(
        'create_user_without_login',
        `create user AppServiceUser without login with default_schema = dbo`,
        ['create user', 'appserviceuser', 'without login', 'default_schema', 'dbo']
    ),
    check(
        'create_user_from_cert',
        `create user CertUser for certificate AppCert`,
        ['create user', 'certuser', 'for certificate', 'appcert']
    ),

    // ── DENY ─────────────────────────────────────────────────────────────────
    check(
        'deny_on_object',
        `deny select, insert, update, delete on dbo.SensitiveData to ReadOnlyUser`,
        ['deny', 'select', 'insert', 'update', 'delete', 'dbo.sensitivedata', 'readonlyuser']
    ),
    check(
        'deny_with_cascade',
        `deny execute on dbo.sp_Admin to PublicRole cascade`,
        ['deny', 'execute', 'dbo.sp_admin', 'publicrole', 'cascade']
    ),

    // ── REVOKE GRANT OPTION FOR ───────────────────────────────────────────────
    check(
        'revoke_grant_option_for',
        `revoke grant option for select on dbo.Orders from PowerUser`,
        ['revoke', 'grant option for', 'select', 'dbo.orders', 'poweruser']
    ),

    // ── ALTER SERVER ROLE ─────────────────────────────────────────────────────
    check(
        'create_server_role',
        `create server role MonitorRole authorization sa`,
        ['create server role', 'monitorrole', 'authorization', 'sa']
    ),
    check(
        'alter_server_role',
        `alter server role sysadmin add member DevAdmin`,
        ['alter server role', 'sysadmin', 'add member', 'devadmin']
    ),
    check(
        'drop_server_role',
        `drop server role MonitorRole`,
        ['drop server role', 'monitorrole']
    ),

    // ── ALTER DATABASE FILE operations ────────────────────────────────────────
    check(
        'alter_database_modify_file',
        `alter database MyApp modify file (name = MyApp_data, size = 100mb, maxsize = unlimited, filegrowth = 10mb)`,
        ['alter database', 'myapp', 'modify file', 'myapp_data', '100mb', 'unlimited', '10mb']
    ),

    // ── CREATE QUEUE ──────────────────────────────────────────────────────────
    check(
        'create_queue',
        `create queue dbo.OrderQueue with status = on, retention = on`,
        ['create queue', 'dbo.orderqueue', 'status = on', 'retention = on']
    ),
    check(
        'alter_queue',
        `alter queue dbo.OrderQueue with status = off, activation (status = off)`,
        ['alter queue', 'dbo.orderqueue', 'status = off']
    ),
    check(
        'drop_queue',
        `drop queue dbo.OrderQueue`,
        ['drop queue', 'dbo.orderqueue']
    ),

    // ── DROP SERVICE / CONTRACT / MESSAGE TYPE ────────────────────────────────
    check(
        'drop_service',
        `drop service OrderService`,
        ['drop service', 'orderservice']
    ),
    check(
        'drop_contract',
        `drop contract OrderContract`,
        ['drop contract', 'ordercontract']
    ),
    check(
        'drop_message_type',
        `drop message type OrderMessage`,
        ['drop message type', 'ordermessage']
    ),

    // ── CREATE RESOURCE POOL ──────────────────────────────────────────────────
    check(
        'create_resource_pool',
        `create resource pool ReportPool with (max_cpu_percent = 30, max_memory_percent = 40)`,
        ['create resource pool', 'reportpool', 'max_cpu_percent', '30', 'max_memory_percent', '40']
    ),

    // ── ALTER RESOURCE GOVERNOR ───────────────────────────────────────────────
    check(
        'alter_resource_governor',
        `alter resource governor reconfigure`,
        ['alter resource governor', 'reconfigure']
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

console.log(`\nProbe 58 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
