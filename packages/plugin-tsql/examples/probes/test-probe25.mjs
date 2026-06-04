/**
 * Probe 25 — XML type methods, JSON functions, UPDATE with joins,
 *             APPLY operators in DML, error handling patterns, sp_ system procs,
 *             WAITFOR RECEIVE, CREATE/ALTER/DROP schema/synonym, INDEX hints
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
    // ── XML type methods ──────────────────────────────────────────────────────
    check(
        'xml_query',
        `select OrderXml.query('/order/items/item') from dbo.Orders`,
        ['orderxml.query', '/order/items/item']
    ),
    check(
        'xml_value',
        `select OrderXml.value('(/order/id)[1]', 'int') from dbo.Orders`,
        ['orderxml.value', '/order/id', 'int']
    ),
    check(
        'xml_exist',
        `select OrderXml.exist('/order[status="shipped"]') from dbo.Orders`,
        ['orderxml.exist', '/order']
    ),
    check(
        'xml_nodes',
        `select n.value('.', 'nvarchar(100)') from dbo.Orders cross apply OrderXml.nodes('/order/item') as T(n)`,
        ['orderxml.nodes', '/order/item', 'nvarchar']
    ),
    check(
        'xml_modify',
        `update dbo.Orders set OrderXml.modify('replace value of (/order/status)[1] with "shipped"')`,
        ['orderxml.modify', 'replace value of', 'shipped']
    ),

    // ── JSON functions ────────────────────────────────────────────────────────
    check(
        'json_value',
        `select json_value(OrderJson, '$.customerId') from dbo.Orders`,
        ['json_value', 'orderjson', '$.customerid']
    ),
    check(
        'json_query',
        `select json_query(OrderJson, '$.items') from dbo.Orders`,
        ['json_query', 'orderjson', '$.items']
    ),
    check(
        'json_modify',
        `update dbo.Orders set OrderJson = json_modify(OrderJson, '$.status', 'shipped')`,
        ['json_modify', 'orderjson', '$.status', 'shipped']
    ),
    check(
        'for_json_path',
        `select Id, Name from dbo.Products for json path, root('Products')`,
        ['for', 'json', 'path', 'root', 'products']
    ),
    check(
        'for_json_auto',
        `select o.OrderId, i.ItemName from dbo.Orders o join dbo.Items i on o.OrderId = i.OrderId for json auto`,
        ['for', 'json', 'auto']
    ),
    check(
        'isjson',
        `select isjson(OrderJson) from dbo.Orders`,
        ['isjson', 'orderjson']
    ),

    // ── UPDATE with FROM join ─────────────────────────────────────────────────
    check(
        'update_from_join',
        `update o set o.Status = 'Processed' from dbo.Orders o join dbo.ProcessedIds p on o.OrderId = p.Id where p.BatchId = 1`,
        ['update', 'set', 'status', 'processed', 'from', 'dbo.orders', 'join', 'dbo.processedids', 'batchid']
    ),
    check(
        'delete_from_join',
        `delete o from dbo.Orders o join dbo.ExpiredOrders e on o.OrderId = e.OrderId`,
        ['delete', 'from', 'dbo.orders', 'join', 'dbo.expiredorders', 'orderid']
    ),

    // ── TABLE HINTS ───────────────────────────────────────────────────────────
    check(
        'nolock_hint',
        `select * from dbo.Orders with (nolock)`,
        ['with', 'nolock']
    ),
    check(
        'multiple_hints',
        `select * from dbo.Orders with (nolock, rowlock)`,
        ['with', 'nolock', 'rowlock']
    ),
    check(
        'updlock_hint',
        `select * from dbo.Orders with (updlock, holdlock)`,
        ['updlock', 'holdlock']
    ),
    check(
        'index_hint',
        `select * from dbo.Orders with (index(IX_Orders_CustId))`,
        ['with', 'index', 'ix_orders_custid']
    ),
    check(
        'forceseek_hint',
        `select * from dbo.Orders with (forceseek)`,
        ['forceseek']
    ),

    // ── QUERY HINTS ───────────────────────────────────────────────────────────
    check(
        'option_maxdop',
        `select * from dbo.Orders option (maxdop 4)`,
        ['option', 'maxdop', '4']
    ),
    check(
        'option_recompile',
        `select * from dbo.Orders where CustomerId = @id option (recompile)`,
        ['option', 'recompile']
    ),
    check(
        'option_optimize_for',
        `select * from dbo.Orders where CustomerId = @id option (optimize for (@id = 1))`,
        ['option', 'optimize', 'for', '@id']
    ),
    check(
        'option_multiple',
        `select * from dbo.Orders option (maxdop 4, recompile, fast 100)`,
        ['option', 'maxdop', '4', 'recompile', 'fast', '100']
    ),

    // ── SCHEMA ────────────────────────────────────────────────────────────────
    check(
        'create_schema',
        `create schema Sales authorization dbo`,
        ['create', 'schema', 'sales', 'authorization', 'dbo']
    ),
    check(
        'create_schema_simple',
        `create schema Reporting`,
        ['create', 'schema', 'reporting']
    ),

    // ── SYNONYM ───────────────────────────────────────────────────────────────
    check(
        'create_synonym',
        `create synonym dbo.Orders for RemoteServer.RemoteDb.dbo.Orders`,
        ['create', 'synonym', 'dbo.orders', 'for', 'remoteserver', 'remotedb', 'dbo.orders']
    ),
    check(
        'drop_synonym',
        `drop synonym if exists dbo.Orders`,
        ['drop', 'synonym', 'if', 'exists', 'dbo.orders']
    ),

    // ── TYPE ──────────────────────────────────────────────────────────────────
    check(
        'create_type_table',
        `create type dbo.OrderList as table (OrderId int not null, Amount decimal(10,2) not null)`,
        ['create', 'type', 'dbo.orderlist', 'as', 'table', 'orderid', 'amount', 'decimal']
    ),
    check(
        'create_type_scalar',
        `create type dbo.PhoneNumber from nvarchar(20) not null`,
        ['create', 'type', 'dbo.phonenumber', 'from', 'nvarchar', '20', 'not null']
    ),

    // ── SEQUENCE USE ──────────────────────────────────────────────────────────
    check(
        'sequence_in_insert',
        `insert into dbo.Orders (OrderId, CustomerId) values (next value for dbo.OrderSeq, 1)`,
        ['next', 'value', 'for', 'dbo.orderseq']
    ),

    // ── RETURN with value ─────────────────────────────────────────────────────
    check(
        'return_value',
        `return @@error`,
        ['return', '@@error']
    ),
    check(
        'return_literal',
        `return 0`,
        ['return', '0']
    ),

    // ── GOTO ──────────────────────────────────────────────────────────────────
    check(
        'goto',
        `goto ErrorHandler`,
        ['goto', 'errorhandler']
    ),
    check(
        'label',
        `ErrorHandler: rollback transaction`,
        ['errorhandler', 'rollback', 'transaction']
    ),

    // ── BREAK / CONTINUE ─────────────────────────────────────────────────────
    check(
        'break',
        `while 1 = 1 begin if @@rowcount = 0 break end`,
        ['break']
    ),
    check(
        'continue',
        `while 1 = 1 begin if @skip = 1 begin set @skip = 0; continue end end`,
        ['continue']
    ),

    // ── TRANSACTION with savepoint ────────────────────────────────────────────
    check(
        'save_transaction',
        `save transaction MySavepoint`,
        ['save', 'transaction', 'mysavepoint']
    ),
    check(
        'rollback_to_savepoint',
        `rollback transaction MySavepoint`,
        ['rollback', 'transaction', 'mysavepoint']
    ),

    // ── EXEC stored proc with OUTPUT params ───────────────────────────────────
    check(
        'exec_output_param',
        `exec dbo.GetCustomerTotal @CustomerId = 1, @Total = @result output`,
        ['exec', 'dbo.getcustomertotal', '@customerid', '1', '@total', '@result', 'output']
    ),

    // ── INSERT with DEFAULT VALUES ────────────────────────────────────────────
    check(
        'insert_default_values',
        `insert into dbo.Audit default values`,
        ['insert', 'into', 'dbo.audit', 'default', 'values']
    ),

    // ── SELECT TOP WITH TIES ──────────────────────────────────────────────────
    check(
        'select_top_with_ties',
        `select top (5) with ties OrderId, Amount from dbo.Orders order by Amount desc`,
        ['top', '5', 'with', 'ties', 'orderid', 'amount']
    ),
    check(
        'select_top_percent',
        `select top (10) percent OrderId from dbo.Orders`,
        ['top', '10', 'percent']
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

console.log(`\nProbe 25 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 300)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
