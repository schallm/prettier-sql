/**
 * Probe 34 — Uncharted territory:
 *   - Linked servers: OPENQUERY, OPENDATASOURCE, four-part names
 *   - EXECUTE ... AT linked_server
 *   - XML methods: xml.value(), xml.query(), xml.nodes(), xml.modify()
 *   - XMLNAMESPACES in WITH clause
 *   - CREATE/ALTER ASSEMBLY
 *   - CLR objects: CREATE FUNCTION/PROCEDURE EXTERNAL NAME
 *   - Row-level security: CREATE SECURITY POLICY
 *   - Dynamic data masking: MASKED WITH (FUNCTION = ...)
 *   - Always Encrypted: ENCRYPTED WITH (...)
 *   - CREATE/DROP CERTIFICATE
 *   - CREATE/DROP SYMMETRIC KEY, ASYMMETRIC KEY
 *   - OPEN/CLOSE SYMMETRIC KEY, OPEN/CLOSE MASTER KEY
 *   - Extended Events: CREATE EVENT SESSION
 *   - CREATE RESOURCE POOL / WORKLOAD GROUP
 *   - DATA CLASSIFICATION: ADD SENSITIVITY CLASSIFICATION
 *   - EXECUTE sp_addlinkedserver / system procs with many params
 *   - THROW with variables
 *   - SELECT INTO (new table)
 *   - TRUNCATE TABLE with partition
 *   - DISABLE / ENABLE TRIGGER
 *   - UPDATE STATISTICS
 *   - CREATE STATISTICS / DROP STATISTICS
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
    // ── Linked servers ────────────────────────────────────────────────────────
    check(
        'openquery',
        `select * from openquery(LINKED_SRV, 'select id, name from RemoteDb.dbo.Customers')`,
        ['openquery', 'linked_srv', 'select', 'id', 'name', 'remotedbs']
    ),
    check(
        'opendatasource',
        `select * from opendatasource('SQLNCLI', 'Data Source=srv;Integrated Security=SSPI').Northwind.dbo.Orders`,
        ['opendatasource', 'sqlncli', 'northwind', 'orders']
    ),
    check(
        'four_part_name',
        `select o.OrderId, c.Name from [LinkedSrv].[RemoteDb].[dbo].[Orders] o inner join [LinkedSrv].[RemoteDb].[dbo].[Customers] c on o.CustomerId = c.Id`,
        ['linkedsrv', 'remotedb', 'dbo', 'orders', 'customers', 'join', 'customerid']
    ),
    check(
        'execute_at_linked_server',
        `exec('select count(*) from dbo.Orders') at LINKED_SRV`,
        ['exec', 'select', 'count', 'orders', 'at', 'linked_srv']
    ),

    // ── XML methods ───────────────────────────────────────────────────────────
    check(
        'xml_value',
        `select @xmlDoc.value('(/root/item/@id)[1]', 'int') as ItemId`,
        ['value', '/root/item/@id', 'int', 'itemid']
    ),
    check(
        'xml_query',
        `select @xmlDoc.query('/root/items/item[price > 10]') as ExpensiveItems`,
        ['query', '/root/items/item', 'expensiveitems']
    ),
    check(
        'xml_exist',
        `select case when @xmlDoc.exist('/root/item[@active="true"]') = 1 then 'yes' else 'no' end`,
        ['exist', '/root/item', 'active', 'yes', 'no']
    ),
    check(
        'xml_nodes',
        `select x.Item.value('@id', 'int'), x.Item.value('name[1]', 'nvarchar(100)') from @xmlDoc.nodes('/root/item') x(Item)`,
        ['nodes', '/root/item', 'value', '@id', 'int', 'nvarchar']
    ),
    check(
        'xml_modify',
        `set @xmlDoc.modify('insert <tag>val</tag> as last into (/root)[1]')`,
        ['modify', 'insert', 'last', 'into', '/root']
    ),
    check(
        'xmlnamespaces',
        `select x.node.value('@id', 'int') from @xml.nodes('/ns:root/ns:item') x(node)`,
        ['nodes', 'ns:root', 'ns:item', 'value']
    ),

    // ── CLR objects ───────────────────────────────────────────────────────────
    check(
        'create_assembly',
        `create assembly MyClrLib from 'C:\clr\MyLib.dll' with permission_set = safe`,
        ['create', 'assembly', 'myclrlib', 'permission_set', 'safe']
    ),
    check(
        'create_clr_function',
        `create function dbo.FormatPhone(@phone nvarchar(20)) returns nvarchar(20) external name MyClrLib.[MyNamespace.MyClass].FormatPhone`,
        ['create', 'function', 'formatphone', 'returns', 'nvarchar', 'external', 'name', 'myclrlib']
    ),
    check(
        'create_clr_procedure',
        `create procedure dbo.SendEmail @to nvarchar(200), @subject nvarchar(200), @body nvarchar(max) as external name MyClrLib.[MyNamespace.Mailer].Send`,
        ['create', 'procedure', 'sendemail', '@to', '@subject', '@body', 'external', 'name', 'myclrlib']
    ),

    // ── Row-level security ────────────────────────────────────────────────────
    check(
        'create_security_policy',
        `create security policy dbo.OrdersPolicy add filter predicate dbo.fn_OrdersFilter(UserId) on dbo.Orders, add block predicate dbo.fn_OrdersFilter(UserId) on dbo.Orders after insert with (state = on)`,
        ['create', 'security', 'policy', 'filter', 'predicate', 'fn_ordersfilter', 'block', 'after', 'insert', 'state', 'on']
    ),
    check(
        'alter_security_policy',
        `alter security policy dbo.OrdersPolicy alter filter predicate dbo.fn_NewFilter(TenantId) on dbo.Orders with (state = off)`,
        ['alter', 'security', 'policy', 'filter', 'predicate', 'fn_newfilter', 'tenantid', 'state', 'off']
    ),

    // ── Dynamic data masking ──────────────────────────────────────────────────
    check(
        'masked_column',
        `create table dbo.Customers (Id int not null, Email nvarchar(200) masked with (function = 'email()') null, Phone nvarchar(20) masked with (function = 'partial(0,"XXX-XXX-",4)') null)`,
        ['masked', 'with', 'function', 'email()', 'partial', 'phone']
    ),
    check(
        'alter_column_add_mask',
        `alter table dbo.Customers alter column SSN add masked with (function = 'partial(0,"XXX-XX-",4)')`,
        ['alter', 'column', 'ssn', 'add', 'masked', 'partial']
    ),

    // ── Always Encrypted ──────────────────────────────────────────────────────
    check(
        'always_encrypted_column',
        `create table dbo.Payroll (Id int not null, Salary decimal(18,2) encrypted with (column_encryption_key = MyCEK, encryption_type = randomized, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256') not null)`,
        ['encrypted', 'with', 'column_encryption_key', 'mycek', 'encryption_type', 'randomized', 'algorithm']
    ),
    check(
        'create_column_encryption_key',
        `create column encryption key MyCEK with values (column_master_key = MyCMK, algorithm = 'RSA_OAEP', encrypted_value = 0x0142)`,
        ['create', 'column', 'encryption', 'key', 'mycek', 'column_master_key', 'mycmk', 'rsa_oaep', 'encrypted_value']
    ),

    // ── Certificates & keys ───────────────────────────────────────────────────
    check(
        'create_certificate',
        `create certificate MyCert with subject = 'My Test Certificate', expiry_date = '2030-12-31'`,
        ['create', 'certificate', 'mycert', 'subject', 'expiry_date', '2030-12-31']
    ),
    check(
        'create_symmetric_key',
        `create symmetric key MySymKey with algorithm = aes_256 encryption by certificate MyCert`,
        ['create', 'symmetric', 'key', 'mysymkey', 'algorithm', 'aes_256', 'encryption', 'by', 'certificate', 'mycert']
    ),
    check(
        'open_close_symmetric_key',
        `open symmetric key MySymKey decryption by certificate MyCert; select encryptbykey(key_guid('MySymKey'), SSN) from dbo.Payroll; close symmetric key MySymKey`,
        ['open', 'symmetric', 'key', 'mysymkey', 'decryption', 'by', 'certificate', 'encryptbykey', 'close']
    ),
    check(
        'create_asymmetric_key',
        `create asymmetric key MyAsymKey with algorithm = rsa_2048`,
        ['create', 'asymmetric', 'key', 'myasymkey', 'algorithm', 'rsa_2048']
    ),

    // ── Extended Events ───────────────────────────────────────────────────────
    check(
        'create_event_session',
        `create event session TraceDeadlocks on server add event sqlserver.xml_deadlock_report (action (sqlserver.sql_text, sqlserver.client_app_name)) add target package0.ring_buffer (set max_memory = 51200) with (max_dispatch_latency = 5 seconds)`,
        ['create', 'event', 'session', 'tracedeadlocks', 'xml_deadlock_report', 'action', 'sql_text', 'ring_buffer', 'max_memory', 'max_dispatch_latency']
    ),
    check(
        'alter_event_session',
        `alter event session TraceDeadlocks on server state = start`,
        ['alter', 'event', 'session', 'tracedeadlocks', 'state', 'start']
    ),

    // ── Resource Governor ─────────────────────────────────────────────────────
    check(
        'create_resource_pool',
        `create resource pool ReportingPool with (min_cpu_percent = 10, max_cpu_percent = 50, min_memory_percent = 5, max_memory_percent = 40)`,
        ['create', 'resource', 'pool', 'reportingpool', 'min_cpu_percent', '10', 'max_cpu_percent', '50']
    ),
    check(
        'create_workload_group',
        `create workload group ReportingGroup with (importance = low, request_max_memory_grant_percent = 25) using ReportingPool`,
        ['create', 'workload', 'group', 'reportinggroup', 'importance', 'low', 'request_max_memory_grant_percent', '25', 'using', 'reportingpool']
    ),

    // ── Data classification ───────────────────────────────────────────────────
    check(
        'add_sensitivity_classification',
        `add sensitivity classification to dbo.Customers.Email with (label = 'Confidential', information_type = 'Contact Info')`,
        ['add', 'sensitivity', 'classification', 'dbo.customers.email', 'label', 'confidential', 'information_type', 'contact info']
    ),
    check(
        'drop_sensitivity_classification',
        `drop sensitivity classification from dbo.Customers.Email`,
        ['drop', 'sensitivity', 'classification', 'dbo.customers.email']
    ),

    // ── SELECT INTO ───────────────────────────────────────────────────────────
    check(
        'select_into',
        `select OrderId, CustomerId, Amount into #TempOrders from dbo.Orders where OrderDate >= '2024-01-01'`,
        ['select', 'orderid', 'customerid', 'amount', 'into', '#temporders', 'from', 'where', 'orderdate']
    ),
    check(
        'select_into_permanent',
        `select p.ProductId, p.Name, sum(s.Qty) as TotalSold into dbo.ProductSalesSummary from dbo.Products p join dbo.Sales s on p.ProductId = s.ProductId group by p.ProductId, p.Name`,
        ['select', 'into', 'dbo.productsalessummary', 'sum', 'totalqty', 'group by']
    ),

    // ── TRUNCATE with partition ───────────────────────────────────────────────
    check(
        'truncate_partition',
        `truncate table dbo.FactSales with (partitions (1, 2, 3 to 5))`,
        ['truncate', 'table', 'dbo.factsales', 'with', 'partitions', '1', '2', '3', '5']
    ),

    // ── ENABLE / DISABLE TRIGGER ──────────────────────────────────────────────
    check(
        'disable_trigger',
        `disable trigger trgAudit on dbo.Orders`,
        ['disable', 'trigger', 'trgaudit', 'on', 'dbo.orders']
    ),
    check(
        'enable_trigger_all',
        `enable trigger all on dbo.Orders`,
        ['enable', 'trigger', 'all', 'on', 'dbo.orders']
    ),

    // ── UPDATE STATISTICS / CREATE STATISTICS ─────────────────────────────────
    check(
        'update_statistics_full',
        `update statistics dbo.Orders IX_Orders_Date with fullscan, norecompute`,
        ['update', 'statistics', 'dbo.orders', 'ix_orders_date', 'fullscan', 'norecompute']
    ),
    check(
        'create_statistics',
        `create statistics ST_Orders_Customer on dbo.Orders (CustomerId, OrderDate) with sample 30 percent`,
        ['create', 'statistics', 'st_orders_customer', 'dbo.orders', 'customerid', 'orderdate', 'sample', '30', 'percent']
    ),

    // ── THROW with variables ──────────────────────────────────────────────────
    check(
        'throw_with_variables',
        `declare @msg nvarchar(2048) = 'Error in ' + object_name(@@procid); throw 50001, @msg, 1`,
        ['throw', '50001', '@msg', '1', 'object_name', '@@procid']
    ),
    check(
        'rethrow',
        `begin try exec dbo.RiskyProc end try begin catch throw end catch`,
        ['begin', 'try', 'exec', 'dbo.riskyproc', 'begin', 'catch', 'throw', 'end', 'catch']
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

console.log(`\nProbe 34 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
