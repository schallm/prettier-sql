/**
 * Seventh probe — tricky areas: EXEC variants, XML, full-text, dynamic SQL,
 * edge cases in common statements.
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

// ── SET STATISTICS TIME/IO ─────────────────────────────────────────────────
await t('set_statistics_time',
    `set statistics time on;`,
    ['set statistics time', 'on']);

await t('set_statistics_io',
    `set statistics io off;`,
    ['set statistics io', 'off']);

// ── SET ROWCOUNT ───────────────────────────────────────────────────────────
await t('set_rowcount',
    `set rowcount 100;`,
    ['set rowcount', '100']);

// ── EXEC with AT linked server ─────────────────────────────────────────────
await t('exec_at_linked',
    `exec ('select top 10 * from Orders') at LinkedServer;`,
    ['at LinkedServer', "'select top 10"]);

// ── sp_executesql with params ─────────────────────────────────────────────
await t('sp_executesql_params',
    `exec sp_executesql N'select * from dbo.T where Id = @Id', N'@Id int', @Id = 5;`,
    ["N'select * from dbo.T", "N'@Id int'", '@Id = 5']);

// ── Multiple batches with GO ───────────────────────────────────────────────
await t('multi_batch',
    `select 1;
     go
     select 2;`,
    ['select 1', 'go', 'select 2']);

// ── INSERT SELECT with schema ─────────────────────────────────────────────
await t('insert_select',
    `insert into dbo.Archive (Id, Name, CreatedAt)
     select Id, Name, getdate() from dbo.Active where IsActive = 0;`,
    ['insert into dbo.Archive', 'select Id, Name', 'IsActive = 0']);

// ── DELETE with TOP ───────────────────────────────────────────────────────
await t('delete_top',
    `delete top (100) from dbo.OldRecords where ExpiresAt < getdate();`,
    ['delete top (100)', 'ExpiresAt < getdate()']);

// ── UPDATE with TOP ───────────────────────────────────────────────────────
await t('update_top',
    `update top (50) dbo.Queue set IsProcessed = 1 where IsProcessed = 0;`,
    ['update top (50)', 'IsProcessed = 1']);

// ── SELECT with TOP PERCENT ────────────────────────────────────────────────
await t('top_percent',
    `select top (10) percent Id, Amount from dbo.Orders order by Amount desc;`,
    ['top (10) percent', 'order by Amount desc']);

// ── FETCH ABSOLUTE / RELATIVE ─────────────────────────────────────────────
await t('fetch_absolute',
    `fetch absolute 5 from MyCursor into @Id;`,
    ['fetch absolute 5', 'from MyCursor', '@Id']);

await t('fetch_relative',
    `fetch relative -1 from MyCursor into @Id;`,
    ['fetch relative -1', 'from MyCursor']);

// ── OPEN / CLOSE / DEALLOCATE cursor ─────────────────────────────────────
await t('cursor_lifecycle',
    `declare C cursor for select Id from dbo.T;
     open C;
     close C;
     deallocate C;`,
    ['open C', 'close C', 'deallocate C']);

// ── XML nodes() method ─────────────────────────────────────────────────────
await t('xml_nodes_method',
    `select n.value('@id', 'int'), n.value('@name', 'nvarchar(100)')
     from @xml.nodes('/root/item') as t(n);`,
    [".nodes('/root/item')", "n.value('@id', 'int')"]);

// ── FOR XML AUTO ───────────────────────────────────────────────────────────
await t('for_xml_auto',
    `select Id, Name from dbo.Orders for xml auto, elements;`,
    ['for xml auto', 'elements']);

// ── FOR XML EXPLICIT ──────────────────────────────────────────────────────
await t('for_xml_explicit',
    `select 1 as tag, null as parent, Id as [Order!1!Id] from dbo.Orders for xml explicit;`,
    ['for xml explicit', '[Order!1!Id]']);

// ── FOR JSON PATH ─────────────────────────────────────────────────────────
await t('for_json_path',
    `select Id, Name as 'order.name' from dbo.Orders for json path, root('Orders');`,
    ['for json path', "root('Orders')"]);

// ── FOR JSON AUTO ─────────────────────────────────────────────────────────
await t('for_json_auto',
    `select Id, Name from dbo.Orders for json auto, include_null_values;`,
    ['for json auto', 'include_null_values']);

// ── OPENXML ───────────────────────────────────────────────────────────────
await t('openxml_stmt',
    `declare @hdoc int;
     exec sp_xml_preparedocument @hdoc output, @xml;
     select * from openxml(@hdoc, '/root/item', 2) with (Id int '@id', Name nvarchar(100));
     exec sp_xml_removedocument @hdoc;`,
    // formatter may wrap with() clause — check semantics
    ['openxml(@hdoc', "'/root/item'", "Id int '@id'"]);

// ── CONTAINS with complex expression ─────────────────────────────────────
await t('contains_inflectional',
    `select * from dbo.Articles where contains(Body, 'FORMSOF(INFLECTIONAL, run)');`,
    ['contains', "'FORMSOF(INFLECTIONAL, run)'"]);

// ── FREETEXTTABLE ─────────────────────────────────────────────────────────
await t('freetexttable',
    `select a.Id, k.rank from dbo.Articles a
     join freetexttable(dbo.Articles, Body, 'database performance') as k on a.Id = k.[key];`,
    ['freetexttable', 'dbo.Articles, Body', "'database performance'", 'k.[key]']);

// ── EXEC with result set ──────────────────────────────────────────────────
await t('exec_with_result_sets',
    `exec dbo.usp_GetData @Id = 1 with result sets ((Id int, Name nvarchar(100)));`,
    ['with result sets', 'Id int', 'Name nvarchar(100)']);

// ── TRIGGER: INSTEAD OF ────────────────────────────────────────────────────
await t('instead_of_trigger',
    `create trigger dbo.trg_View on dbo.MyView instead of insert as
     begin
        insert into dbo.RealTable select * from inserted;
     end;`,
    ['instead of insert', 'inserted']);

// ── Multiple triggers ─────────────────────────────────────────────────────
await t('multi_action_trigger',
    `create trigger dbo.trg_Audit on dbo.Orders after insert, update, delete as
     begin select 1; end;`,
    ['after insert, update, delete']);

// ── DROP TABLE IF EXISTS (multiple) ──────────────────────────────────────
await t('drop_table_multi',
    `drop table if exists dbo.T1, dbo.T2, dbo.T3;`,
    ['if exists', 'dbo.T1', 'dbo.T2', 'dbo.T3']);

// ── CREATE NONCLUSTERED INDEX on computed column ──────────────────────────
await t('index_on_computed',
    `create table dbo.T (A int, B int, C as (A + B));
     create nonclustered index IX_C on dbo.T (C);`,
    // formatter may break line after index name; check semantics only
    ['as (A + B)', 'nonclustered index IX_C', 'on dbo.T', 'C asc']);

// ── Schema-qualified table variable ──────────────────────────────────────
await t('table_variable',
    `declare @T table (Id int primary key, Name nvarchar(100) not null);
     insert @T values (1, 'test');`,
    ['declare @T table', 'Id int primary key', "values (1, 'test')"]);

// ── TRY_CAST with NULL result ──────────────────────────────────────────────
await t('try_cast_null',
    `select try_cast(Col as decimal(10,2)) from dbo.T;`,
    ['try_cast(Col as decimal']);

// ── IDENTITY_INSERT ────────────────────────────────────────────────────────
await t('identity_insert',
    `set identity_insert dbo.T on;
     insert into dbo.T (Id, Name) values (100, 'Manual');
     set identity_insert dbo.T off;`,
    ['set identity_insert dbo.T on', "values (100, 'Manual')", 'set identity_insert dbo.T off']);

// ── SWITCH TO partition ────────────────────────────────────────────────────
await t('partition_switch',
    `alter table dbo.Archive switch partition 3 to dbo.Archive_Cold partition 1;`,
    ['switch partition 3', 'dbo.Archive_Cold partition 1']);

// ── Table hint: NOEXPAND ──────────────────────────────────────────────────
await t('noexpand_hint',
    `select * from dbo.MyIndexedView with (noexpand);`,
    ['with (noexpand)']);

// ── EXCEPT / INTERSECT ────────────────────────────────────────────────────
await t('except_intersect',
    `select Id from dbo.A
     intersect
     select Id from dbo.B
     except
     select Id from dbo.C;`,
    ['intersect', 'except', 'dbo.A', 'dbo.B', 'dbo.C']);

// ── ROW_NUMBER deduplication pattern ─────────────────────────────────────
await t('rownumber_dedup',
    `with CTE as (
        select *, row_number() over (partition by Email order by Id desc) as rn
        from dbo.Users
     )
     delete from CTE where rn > 1;`,
    ['row_number()', 'partition by Email', 'rn > 1']);

console.log(`\n${ok} passed, ${fail} failed`);
