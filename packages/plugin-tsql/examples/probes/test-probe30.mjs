/**
 * Probe 30 — CREATE EXTERNAL TABLE/DATA SOURCE/FILE FORMAT (PolyBase),
 *             EXECUTE AT linked server, CREATE PARTITION FUNCTION/SCHEME,
 *             ALTER TABLE REBUILD/REORGANIZE,
 *             column encryption (Always Encrypted),
 *             BULK INSERT format file, SEQUENCE DEFAULT,
 *             EXECUTE string at linked server,
 *             Rarer DDL: CREATE/DROP DEFAULT, CREATE/DROP RULE (legacy),
 *             table variable in stored proc, OUTPUT INTO table variable,
 *             CROSS APPLY to values() / string_split,
 *             INDEX on table variable
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
    // ── EXECUTE AT linked server ───────────────────────────────────────────────
    check(
        'exec_at_linked_server',
        `exec ('select count(*) from dbo.Orders') at LinkedServer`,
        ['exec', 'select count(*) from dbo.orders', 'at', 'linkedserver']
    ),
    check(
        'exec_proc_at_linked_server',
        `exec dbo.MyProc @p1 = 1 at LinkedServer`,
        ['exec', 'dbo.myproc', '@p1', '1', 'at', 'linkedserver']
    ),

    // ── CREATE PARTITION FUNCTION ─────────────────────────────────────────────
    check(
        'create_partition_function',
        `create partition function pfYearly(int) as range right for values (2020, 2021, 2022, 2023, 2024)`,
        ['create', 'partition', 'function', 'pfyearly', 'range', 'right', 'for', 'values', '2020', '2021', '2022', '2023', '2024']
    ),
    check(
        'create_partition_function_left',
        `create partition function pfMonthly(date) as range left for values ('2024-01-01', '2024-02-01', '2024-03-01')`,
        ['range', 'left', 'for', 'values', '2024-01-01', '2024-02-01']
    ),

    // ── CREATE PARTITION SCHEME ───────────────────────────────────────────────
    check(
        'create_partition_scheme',
        `create partition scheme psYearly as partition pfYearly to (fg2020, fg2021, fg2022, fg2023, fg2024, fgFuture)`,
        ['create', 'partition', 'scheme', 'psyearly', 'as', 'partition', 'pfyearly', 'to', 'fg2020', 'fg2021', 'fgfuture']
    ),
    check(
        'create_partition_scheme_all',
        `create partition scheme psAll as partition pfYearly all to (DataFileGroup)`,
        ['create', 'partition', 'scheme', 'all', 'to', 'datafilegroup']
    ),

    // ── ALTER TABLE REBUILD / REORGANIZE ──────────────────────────────────────
    check(
        'alter_table_rebuild',
        `alter table dbo.Orders rebuild`,
        ['alter', 'table', 'dbo.orders', 'rebuild']
    ),
    check(
        'alter_table_rebuild_partition',
        `alter table dbo.BigTable rebuild partition = 3`,
        ['alter', 'table', 'dbo.bigtable', 'rebuild', 'partition', '3']
    ),
    check(
        'alter_table_reorganize',
        `alter table dbo.Orders reorganize`,
        ['alter', 'table', 'dbo.orders', 'reorganize']
    ),

    // ── TABLE VARIABLE with operations ────────────────────────────────────────
    check(
        'table_variable_with_operations',
        `declare @t table (Id int not null, Name nvarchar(100) not null); insert into @t values (1, 'Alice'), (2, 'Bob'); select * from @t where Id = 1`,
        ['declare', '@t', 'table', 'id', 'name', 'insert', 'into', '@t', 'alice', 'bob', 'select', '@t', 'id']
    ),

    // ── OUTPUT INTO table variable ────────────────────────────────────────────
    check(
        'output_into_table_var',
        `declare @deleted table (OrderId int, CustomerId int); delete from dbo.Orders output deleted.OrderId, deleted.CustomerId into @deleted where OrderDate < '2020-01-01'; select count(*) from @deleted`,
        ['output', 'deleted.orderid', 'deleted.customerid', 'into', '@deleted', 'count']
    ),

    // ── CROSS APPLY string_split ──────────────────────────────────────────────
    check(
        'cross_apply_string_split',
        `select o.OrderId, t.value as Tag from dbo.Orders o cross apply string_split(o.Tags, ',') t`,
        ['cross', 'apply', 'string_split', 'o.tags', "','", 'tag']
    ),

    // ── SEQUENCE as column default ────────────────────────────────────────────
    check(
        'sequence_as_default',
        `create table dbo.Orders (OrderId int not null default (next value for dbo.OrderSeq) primary key, CustomerId int not null)`,
        ['default', 'next', 'value', 'for', 'dbo.orderseq', 'customerid']
    ),

    // ── ALTER SEQUENCE ────────────────────────────────────────────────────────
    check(
        'alter_sequence',
        `alter sequence dbo.OrderSeq restart with 1000 increment by 5 maxvalue 999999 cycle`,
        ['alter', 'sequence', 'dbo.orderseq', 'restart', 'with', '1000', 'increment', 'by', '5', 'maxvalue', '999999', 'cycle']
    ),

    // ── DROP SEQUENCE ─────────────────────────────────────────────────────────
    check(
        'drop_sequence',
        `drop sequence if exists dbo.OrderSeq`,
        ['drop', 'sequence', 'if', 'exists', 'dbo.orderseq']
    ),

    // ── CREATE EXTERNAL DATA SOURCE ───────────────────────────────────────────
    check(
        'create_external_data_source',
        `create external data source MyBlob with (type = blob_storage, location = 'https://myaccount.blob.core.windows.net/mycontainer', credential = MyCredential)`,
        ['create', 'external', 'data', 'source', 'myblob', 'with', 'type', 'blob_storage', 'location', 'credential']
    ),

    // ── CREATE EXTERNAL FILE FORMAT ───────────────────────────────────────────
    check(
        'create_external_file_format',
        `create external file format CsvFormat with (format_type = delimitedtext, format_options (field_terminator = ',', string_delimiter = '"'))`,
        ['create', 'external', 'file', 'format', 'csvformat', 'format_type', 'delimitedtext', 'field_terminator']
    ),

    // ── BULK INSERT advanced ──────────────────────────────────────────────────
    check(
        'bulk_insert_format_file',
        `bulk insert dbo.Orders from 'C:\\data\\orders.csv' with (formatfile = 'C:\\format\\orders.fmt', tablock, maxerrors = 10)`,
        ['bulk', 'insert', 'dbo.orders', 'formatfile', 'tablock', 'maxerrors', '10']
    ),

    // ── BEGIN/END with nested TRY/CATCH ──────────────────────────────────────
    check(
        'nested_try_catch',
        `begin try begin try insert into dbo.T values (1) end try begin catch rollback end catch end try begin catch raiserror ('Outer error', 16, 1) end catch`,
        ['begin', 'try', 'end', 'try', 'begin', 'catch', 'rollback', 'end', 'catch', 'outer error']
    ),

    // ── DECLARE multiple variables ────────────────────────────────────────────
    check(
        'declare_multiple',
        `declare @a int, @b nvarchar(100), @c decimal(10,2) = 0.0`,
        ['@a', 'int', '@b', 'nvarchar', '100', '@c', 'decimal', '10', '2', '0.0']
    ),

    // ── COLLATE on expression ─────────────────────────────────────────────────
    check(
        'collate_expression',
        `select Name collate SQL_Latin1_General_CP1_CI_AS from dbo.Products`,
        ['collate', 'sql_latin1_general_cp1_ci_as', 'name']
    ),

    // ── SELECT INTO new table ──────────────────────────────────────────────────
    check(
        'select_into_new_table',
        `select OrderId, CustomerId, OrderDate into dbo.OrdersArchive2023 from dbo.Orders where year(OrderDate) = 2023`,
        ['select', 'into', 'dbo.ordersarchive2023', 'orderid', 'customerid', 'orderdate', 'year']
    ),

    // ── DISTINCT with TOP ─────────────────────────────────────────────────────
    check(
        'select_distinct_top',
        `select distinct top (100) CustomerId from dbo.Orders order by CustomerId`,
        ['select', 'distinct', 'top', '100', 'customerid', 'order by']
    ),

    // ── Scalar subquery in SELECT ──────────────────────────────────────────────
    check(
        'scalar_subquery',
        `select OrderId, (select sum(Amount) from dbo.Items where OrderId = o.OrderId) as TotalAmount from dbo.Orders o`,
        ['orderid', 'select', 'sum(amount)', 'from', 'dbo.items', 'totalamount']
    ),

    // ── CTE recursive ────────────────────────────────────────────────────────
    check(
        'recursive_cte',
        `with OrgTree as (select Id, ParentId, Name, 0 as Level from dbo.Org where ParentId is null union all select o.Id, o.ParentId, o.Name, t.Level + 1 from dbo.Org o join OrgTree t on o.ParentId = t.Id) select * from OrgTree option (maxrecursion 100)`,
        ['with', 'orgtree', 'as', 'parentid', 'is', 'null', 'union', 'all', 'level', '+', '1', 'option', 'maxrecursion', '100']
    ),

    // ── FOR XML EXPLICIT ──────────────────────────────────────────────────────
    check(
        'for_xml_explicit_binary_base64',
        `select 1 as tag, null as parent, OrderId as [Order!1!OrderId] from dbo.Orders for xml explicit`,
        ['for', 'xml', 'explicit', 'tag', 'parent', 'order!1!orderid']
    ),

    // ── READTEXT / WRITETEXT (legacy LOB) ─────────────────────────────────────
    // skip these as very legacy

    // ── CREATE FULLTEXT INDEX ─────────────────────────────────────────────────
    check(
        'create_fulltext_index',
        `create fulltext index on dbo.Products (Name language 1033, Description language 1033) key index PK_Products on FullTextCatalog with stoplist = off`,
        ['create', 'fulltext', 'index', 'on', 'dbo.products', 'name', 'description', 'language', '1033', 'key', 'index', 'pk_products']
    ),

    // ── CREATE FULLTEXT CATALOG ────────────────────────────────────────────────
    check(
        'create_fulltext_catalog',
        `create fulltext catalog FtCatalog as default`,
        ['create', 'fulltext', 'catalog', 'ftcatalog', 'as', 'default']
    ),

    // ── ALTER INDEX REORGANIZE ────────────────────────────────────────────────
    check(
        'alter_index_reorganize',
        `alter index IX_Orders_Date on dbo.Orders reorganize`,
        ['alter', 'index', 'ix_orders_date', 'on', 'dbo.orders', 'reorganize']
    ),
    check(
        'alter_index_disable',
        `alter index IX_Orders_Date on dbo.Orders disable`,
        ['alter', 'index', 'ix_orders_date', 'on', 'dbo.orders', 'disable']
    ),
    check(
        'alter_index_all_rebuild',
        `alter index all on dbo.Orders rebuild with (online = on)`,
        ['alter', 'index', 'all', 'on', 'dbo.orders', 'rebuild', 'with', 'online', 'on']
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

console.log(`\nProbe 30 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
