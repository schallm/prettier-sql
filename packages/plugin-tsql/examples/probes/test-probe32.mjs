/**
 * Probe 32 — Final sweep: procedure parameter attributes,
 *   column-level CHECK constraint name preservation,
 *   column-level UNIQUE constraint name preservation,
 *   ALTER TABLE DISABLE/ENABLE TRIGGER,
 *   DBCC with more commands, specific SET statement variants,
 *   linked server INSERT/UPDATE/DELETE,
 *   EXECUTE with AT on string, WITH RESULT SETS UNDEFINED,
 *   TRUNCATE TABLE WITH PARTITIONS,
 *   CREATE/ALTER/DROP DATABASE AUDIT SPECIFICATION,
 *   RESTORE with multiple WITH options,
 *   CREATE CREDENTIAL, ALTER CREDENTIAL,
 *   CROSS JOIN with big lateral subquery,
 *   parameter default values in stored proc
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
    // ── Column-level CHECK constraint name ────────────────────────────────────
    check(
        'column_check_constraint_name',
        `create table dbo.Orders (OrderId int not null, Amount decimal(10,2) not null constraint CHK_Amount check (Amount > 0))`,
        ['constraint', 'chk_amount', 'check', 'amount', '0']
    ),

    // ── Column-level UNIQUE constraint name ───────────────────────────────────
    check(
        'column_unique_constraint_name',
        `create table dbo.Products (ProductId int not null primary key, SKU nvarchar(50) not null constraint UQ_SKU unique)`,
        ['constraint', 'uq_sku', 'unique', 'sku']
    ),

    // ── Procedure parameters with default values ──────────────────────────────
    check(
        'proc_param_default',
        `create procedure dbo.GetOrders @CustomerId int = null, @Status nvarchar(20) = 'Active', @MaxRows int = 100 as select top (@MaxRows) * from dbo.Orders where CustomerId = @CustomerId or @CustomerId is null`,
        ['@customerid', 'int', '= null', '@status', 'nvarchar', "'active'", '@maxrows', '100', 'or', '@customerid', 'is null']
    ),

    // ── Procedure with OUTPUT parameter ───────────────────────────────────────
    check(
        'proc_output_param',
        `create procedure dbo.GetCount @CustomerId int, @Count int output as select @Count = count(*) from dbo.Orders where CustomerId = @CustomerId`,
        ['@count', 'int', 'output', 'select', '@count', '=', 'count(*)']
    ),

    // ── Linked server DML ─────────────────────────────────────────────────────
    check(
        'linked_server_update',
        `update LinkedSrv.RemoteDb.dbo.Orders set Status = 'Archived' where OrderDate < '2020-01-01'`,
        ['update', 'linkedsrv', 'remotedb', 'dbo', 'orders', 'set', 'status', 'archived', 'orderdate']
    ),
    check(
        'linked_server_delete',
        `delete from LinkedSrv.RemoteDb.dbo.OldData where ExpiryDate < getdate()`,
        ['delete', 'from', 'linkedsrv', 'remotedb', 'dbo', 'olddata', 'expirydate', 'getdate']
    ),

    // ── EXECUTE with AT on string ──────────────────────────────────────────────
    check(
        'exec_string_at',
        `exec ('select count(*) from sys.tables') at LinkedServer`,
        ['exec', 'select count(*) from sys.tables', 'at', 'linkedserver']
    ),

    // ── DBCC additional commands ──────────────────────────────────────────────
    check(
        'dbcc_sqlperf',
        `dbcc sqlperf (logspace)`,
        ['dbcc', 'sqlperf', 'logspace']
    ),
    check(
        'dbcc_updateusage',
        `dbcc updateusage (0)`,
        ['dbcc', 'updateusage', '0']
    ),
    check(
        'dbcc_opentran',
        `dbcc opentran`,
        ['dbcc', 'opentran']
    ),

    // ── SET CONTEXT_INFO ──────────────────────────────────────────────────────
    check(
        'set_context_info',
        `set context_info 0x01020304`,
        ['set', 'context_info', '0x01020304']
    ),

    // ── ENABLE / DISABLE TRIGGER on TABLE ─────────────────────────────────────
    check(
        'disable_trigger_all',
        `disable trigger all on dbo.Orders`,
        ['disable', 'trigger', 'all', 'dbo.orders']
    ),
    check(
        'enable_trigger_specific',
        `enable trigger trgAudit on dbo.Orders`,
        ['enable', 'trigger', 'trgaudit', 'dbo.orders']
    ),

    // ── ALTER TABLE SWITCH with options ───────────────────────────────────────
    check(
        'alter_table_switch_options',
        `alter table dbo.SalesCurrent switch partition 3 to dbo.SalesArchive partition 1 with (wait_at_low_priority (max_duration = 10 minutes, abort_after_wait = self))`,
        ['switch', 'partition', '3', 'to', 'dbo.salesarchive', 'wait_at_low_priority', 'max_duration', '10', 'abort_after_wait']
    ),

    // ── CREATE CREDENTIAL ─────────────────────────────────────────────────────
    check(
        'create_credential',
        `create credential BlobCredential with identity = 'MyStorageAccount', secret = 'MyStorageKey'`,
        ['create', 'credential', 'blobcredential', 'with', 'identity', 'mystorageaccount', 'secret']
    ),

    // ── ALTER TABLE WITH (lock hints) ─────────────────────────────────────────
    check(
        'create_table_with_data_compression',
        `create table dbo.BigTable (Id int not null primary key, Data nvarchar(max)) with (data_compression = page)`,
        ['create', 'table', 'dbo.bigtable', 'with', 'data_compression', 'page']
    ),

    // ── WITH RESULT SETS UNDEFINED ────────────────────────────────────────────
    check(
        'exec_with_result_sets_undefined',
        `exec dbo.GetOrders with result sets undefined`,
        ['exec', 'dbo.getorders', 'with', 'result', 'sets', 'undefined']
    ),
    check(
        'exec_with_result_sets_none',
        `exec dbo.DoWork with result sets none`,
        ['exec', 'dbo.dowork', 'with', 'result', 'sets', 'none']
    ),

    // ── SELECT with FOR UPDATE / FOR READ ONLY (cursor) ───────────────────────
    check(
        'cursor_for_read_only',
        `declare myCursor cursor for select Id, Name from dbo.Products for read only`,
        ['cursor', 'for', 'select', 'id', 'name', 'for', 'read', 'only']
    ),
    check(
        'cursor_for_update',
        `declare myCursor cursor for select Id, Name from dbo.Products for update of Name`,
        ['cursor', 'for', 'select', 'for', 'update', 'of', 'name']
    ),

    // ── Stored proc with VARYING / READONLY params ─────────────────────────────
    check(
        'proc_readonly_param',
        `create procedure dbo.ProcessList @Ids dbo.IntList readonly as select * from dbo.Orders where CustomerId in (select Id from @Ids)`,
        ['@ids', 'dbo.intlist', 'readonly', 'select', 'from', '@ids']
    ),

    // ── ALTER PROCEDURE with SET options ──────────────────────────────────────
    check(
        'alter_proc_with_options',
        `alter procedure dbo.GetOrder @Id int with recompile, encryption as select * from dbo.Orders where OrderId = @Id`,
        ['alter', 'procedure', 'dbo.getorder', 'with', 'recompile', 'encryption', 'as', 'select']
    ),

    // ── SET OFFSETS (rarely used but valid) ───────────────────────────────────
    check(
        'set_statistics_io',
        `set statistics io on`,
        ['set', 'statistics', 'io', 'on']
    ),
    check(
        'set_statistics_time',
        `set statistics time on`,
        ['set', 'statistics', 'time', 'on']
    ),

    // ── TRUNCATE TABLE WITH PARTITIONS ────────────────────────────────────────
    check(
        'truncate_with_partitions_range',
        `truncate table dbo.BigTable with (partitions (1 to 3, 5, 7 to 9))`,
        ['truncate', 'table', 'dbo.bigtable', 'with', 'partitions', '1', 'to', '3', '5', '7', 'to', '9']
    ),

    // ── CREATE SCHEMA with multiple owned objects ─────────────────────────────
    // (SSMS generates CREATE SCHEMA inline for multiple objects — not needed here)

    // ── DROP TABLE multiple tables ─────────────────────────────────────────────
    check(
        'drop_multiple_tables',
        `drop table if exists #TempA, #TempB, #TempC`,
        ['drop', 'table', 'if', 'exists', '#tempa', '#tempb', '#tempc']
    ),

    // ── Multi-statement TVF pattern ────────────────────────────────────────────
    check(
        'create_mtvf',
        `create function dbo.GetOrdersForCustomer(@CustomerId int, @Status nvarchar(20)) returns @result table (OrderId int not null, OrderDate date not null, Amount decimal(10,2) not null) as begin insert into @result select OrderId, OrderDate, Amount from dbo.Orders where CustomerId = @CustomerId and Status = @Status; return; end`,
        ['create', 'function', 'returns', '@result', 'table', 'orderid', 'orderdate', 'amount', 'as', 'begin', 'insert', 'into', '@result', 'return', 'end']
    ),

    // ── EXECUTE AS LOGIN / REVERT in trigger ──────────────────────────────────
    check(
        'trigger_execute_as',
        `create trigger trgAudit on dbo.Orders after insert with execute as 'AuditUser' as begin insert into dbo.Audit values (getdate(), original_login()) end`,
        ['with', 'execute', 'as', 'audituser', 'insert', 'dbo.audit', 'original_login']
    ),

    // ── INSERT with explicit column list and SELECT * ─────────────────────────
    check(
        'insert_select_star',
        `insert into dbo.Archive (OrderId, CustomerId, OrderDate, Amount) select OrderId, CustomerId, OrderDate, Amount from dbo.Orders where Status = 'Completed'`,
        ['insert', 'into', 'dbo.archive', 'orderid', 'customerid', 'orderdate', 'amount', 'select', 'from', 'dbo.orders', 'completed']
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

console.log(`\nProbe 32 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
