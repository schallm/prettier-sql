/**
 * Sixteenth probe — INSERT...EXEC, OUTPUT variations, full-text/spatial DDL,
 * credentials, graph tables, index compression, partition merging.
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = join(__dirname, 'dist/index.js');
const fmt = sql =>
    prettier.format(sql, { parser: 'tsql', plugins: [plugin], printWidth: 80 }).then(r => r.trim());
const norm = s => s.replace(/\s+/g, ' ').toLowerCase();

let ok = 0, fail = 0;
async function t(name, sql, must) {
    let out;
    try { out = await fmt(sql); }
    catch (e) { console.log(`FAIL [${name}] ERROR: ${e.message}`); fail++; return; }
    const no = norm(out);
    const missing = must.filter(m => !no.includes(norm(m)));
    if (missing.length) {
        console.log(`FAIL [${name}] DROPPED: ${missing.join(' | ')}`);
        console.log(out.split('\n').map(l => '  ' + l).join('\n'));
        fail++;
    } else ok++;
}

// ── INSERT ... EXEC ────────────────────────────────────────────────────────
await t('insert_exec',
    `insert into dbo.Results (Id, Name, Amount)
     exec dbo.usp_GetPendingOrders @StartDate = '2024-01-01', @MaxRows = 100;`,
    ['insert into dbo.Results', 'exec dbo.usp_GetPendingOrders', "'2024-01-01'"]);

await t('insert_exec_sp',
    `declare @t table (Id int, Name nvarchar(100));
     insert @t exec sp_executesql N'select Id, Name from dbo.T';`,
    ['insert', 'exec sp_executesql', "N'select Id, Name"]);

// ── OUTPUT clause in UPDATE ───────────────────────────────────────────────
await t('update_output',
    `update dbo.Orders
     set Status = 'Processed', ProcessedAt = getdate()
     output inserted.Id, deleted.Status, inserted.Status, getdate() as ChangedAt
     into @AuditLog
     where Status = 'Pending';`,
    ['output inserted.Id', 'deleted.Status', 'inserted.Status',
     'into @AuditLog', "where Status = 'Pending'"]);

// ── OUTPUT clause in DELETE ───────────────────────────────────────────────
await t('delete_output_cte',
    `with Old as (
         select top (500) Id, CreatedAt from dbo.Log order by CreatedAt asc
     )
     delete from Old
     output deleted.Id, deleted.CreatedAt into @Archived;`,
    ['output deleted.Id, deleted.CreatedAt', 'into @Archived']);

// ── INSERT OUTPUT without INTO ────────────────────────────────────────────
await t('insert_output_no_into',
    `insert into dbo.T (Name, Amount)
     output inserted.Id, inserted.Name
     values ('Test', 42.0);`,
    ['output inserted.Id, inserted.Name', "values ('Test', 42.0)"]);

// ── CREATE FULLTEXT INDEX ──────────────────────────────────────────────────
await t('create_fulltext_index',
    `create fulltext index on dbo.Articles
     (Title language 1033, Body language 1033)
     key index PK_Articles
     on fulltext_catalog_name
     with stoplist = system, change_tracking = auto;`,
    ['create fulltext index', 'dbo.Articles', 'Title language 1033',
     'key index PK_Articles', 'fulltext_catalog_name',
     'stoplist = system', 'change_tracking = auto']);

// ── ALTER FULLTEXT INDEX ───────────────────────────────────────────────────
await t('alter_fulltext_index',
    `alter fulltext index on dbo.Articles add (Summary language 1033);`,
    ['alter fulltext index', 'dbo.Articles', 'Summary language 1033']);

// ── DROP FULLTEXT INDEX ────────────────────────────────────────────────────
await t('drop_fulltext_index',
    `drop fulltext index on dbo.Articles;`,
    ['drop fulltext index', 'dbo.Articles']);

// ── CREATE FULLTEXT CATALOG ───────────────────────────────────────────────
await t('create_fulltext_catalog',
    `create fulltext catalog MyCatalog as default;`,
    ['create fulltext catalog MyCatalog', 'as default']);

// ── CREATE SPATIAL INDEX ───────────────────────────────────────────────────
await t('create_spatial_index',
    `create spatial index SI_Locations on dbo.Locations (GeoCol)
     using geometry_grid
     with (bounding_box = (0, 0, 100, 100),
           grids = (low, low, medium, high),
           cells_per_object = 16);`,
    ['create spatial index SI_Locations', 'geometry_grid',
     'bounding_box = (0, 0, 100, 100)', 'cells_per_object = 16']);

// ── CREATE XML INDEX ──────────────────────────────────────────────────────
await t('create_xml_index',
    `create primary xml index PIX_Orders on dbo.Orders (XmlData);`,
    ['create primary xml index PIX_Orders', 'dbo.Orders', 'XmlData']);

await t('create_xml_index_secondary',
    `create xml index SIX_Orders_PATH on dbo.Orders (XmlData)
     using xml index PIX_Orders for path;`,
    ['create xml index SIX_Orders_PATH', 'using xml index PIX_Orders', 'for path']);

// ── CREATE CREDENTIAL ─────────────────────────────────────────────────────
await t('create_credential',
    `create credential MyCredential
     with identity = 'StorageAccount',
          secret = 'base64encodedkey==';`,
    ["create credential MyCredential", "identity = 'StorageAccount'",
     "secret = 'base64encodedkey=='"]);

// ── ALTER CREDENTIAL ──────────────────────────────────────────────────────
await t('alter_credential',
    `alter credential MyCredential
     with identity = 'NewAccount', secret = 'newkey==';`,
    ['alter credential MyCredential', "identity = 'NewAccount'"]);

// ── DROP CREDENTIAL ───────────────────────────────────────────────────────
await t('drop_credential',
    `drop credential MyCredential;`,
    ['drop credential MyCredential']);

// ── CREATE INDEX with DATA_COMPRESSION ────────────────────────────────────
await t('index_page_compression',
    `create nonclustered index IX_Orders_Compressed
     on dbo.Orders (CustId, OrderDate)
     with (data_compression = page, online = on, fillfactor = 80);`,
    ['data_compression = page', 'online = on', 'fillfactor = 80']);

// ── ALTER TABLE MERGE RANGE (partition) ───────────────────────────────────
await t('alter_partition_fn_merge',
    `alter partition function pf_Monthly() merge range ('2020-01-01');`,
    ['alter partition function pf_Monthly', "merge range ('2020-01-01')"]);

// ── ALTER TABLE SPLIT RANGE (partition) ───────────────────────────────────
await t('alter_partition_fn_split',
    `alter partition function pf_Monthly() split range ('2025-01-01');`,
    ['alter partition function pf_Monthly', "split range ('2025-01-01')"]);

// ── CREATE TABLE AS NODE (graph) ──────────────────────────────────────────
await t('create_table_as_node',
    `create table dbo.Person (Id int not null primary key, Name nvarchar(100)) as node;`,
    ['create table dbo.Person', 'as node']);

// ── CREATE TABLE AS EDGE (graph) ──────────────────────────────────────────
await t('create_table_as_edge',
    `create table dbo.Knows (Weight int) as edge;`,
    ['create table dbo.Knows', 'as edge']);

// ── Graph query: MATCH ─────────────────────────────────────────────────────
await t('graph_match',
    `select p1.Name, p2.Name
     from dbo.Person p1, dbo.Knows k, dbo.Person p2
     where match(p1-(k)->p2);`,
    ['match', 'p1-(k)->p2']);

// ── WITH CHANGE_TRACKING_CONTEXT ──────────────────────────────────────────
await t('change_tracking_context',
    `with change_tracking_context (@ctx)
     update dbo.T set Name = 'Updated' where Id = 1;`,
    ['with change_tracking_context', 'update dbo.T', 'Name']);

// ── KILL QUERY NOTIFICATION SUBSCRIPTION ─────────────────────────────────
await t('kill_query_notification',
    `kill query notification subscription all;`,
    ['kill query notification subscription all']);

// ── KILL STATS JOB ────────────────────────────────────────────────────────
await t('kill_stats_job',
    `kill stats job 42;`,
    ['kill stats job', '42']);

// ── RECONFIGURE WITH OVERRIDE ─────────────────────────────────────────────
await t('reconfigure_override',
    `reconfigure with override;`,
    ['reconfigure', 'with override']);

// ── SET CONTEXT_INFO ──────────────────────────────────────────────────────
await t('set_context_info',
    `set context_info 0x1234567890;`,
    ['set context_info', '0x1234567890']);

// ── CREATE INDEX with ONLINE and RESUMABLE ─────────────────────────────────
await t('index_resumable',
    `create nonclustered index IX_Orders_Resumable
     on dbo.Orders (CustId)
     with (online = on, resumable = on, max_duration = 120);`,
    ['online = on', 'resumable = on', 'max_duration = 120']);

// ── ALTER INDEX REBUILD with PARTITION ────────────────────────────────────
await t('alter_index_rebuild_partition',
    `alter index IX_Orders on dbo.Orders
     rebuild partition = 3
     with (data_compression = row, online = on);`,
    ['alter index IX_Orders', 'rebuild partition = 3',
     'data_compression = row', 'online = on']);

// ── TRUNCATE TABLE with partition ─────────────────────────────────────────
await t('truncate_with_partition',
    `truncate table dbo.Orders with (partitions (1, 3, 5 to 8));`,
    ['truncate table dbo.Orders', 'partitions (1, 3, 5 to 8)']);

// ── CREATE DATABASE with options ──────────────────────────────────────────
await t('create_database_opts',
    `create database TestDb
     on primary (name = 'TestDb', filename = 'C:\\data\\TestDb.mdf', size = 100mb)
     log on (name = 'TestDb_log', filename = 'C:\\data\\TestDb_log.ldf', size = 10mb)
     collate Latin1_General_CI_AS;`,
    ['create database TestDb', 'on primary', "name = 'TestDb'",
     'log on', 'size = 100mb', 'Latin1_General_CI_AS']);

// ── RESTORE DATABASE with RECOVERY ────────────────────────────────────────
await t('restore_with_recovery',
    `restore database MyDb from disk = 'C:\\backups\\MyDb.bak'
     with recovery, stats = 10, move 'MyDb' to 'C:\\data\\MyDb.mdf';`,
    ['restore database MyDb', 'with recovery', 'stats = 10',
     "move 'MyDb'", "'C:\\data\\MyDb.mdf'"]);

console.log(`\n${ok} passed, ${fail} failed`);
