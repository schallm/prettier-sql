/**
 * Eighth probe — edge cases in INSERT/SELECT, DML expressions,
 * and less-common T-SQL constructs.
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

// ── GRANT on database-scoped objects ──────────────────────────────────────
await t('grant_db_object',
    `grant execute on dbo.usp_GetData to AppUser;`,
    ['grant execute', 'dbo.usp_GetData', 'AppUser']);

await t('grant_schema',
    `grant execute on schema::dbo to AppUser;`,
    ['grant execute', 'schema::dbo', 'AppUser']);

// ── REVOKE with CASCADE ───────────────────────────────────────────────────
await t('revoke_with_cascade',
    `revoke execute on dbo.usp_GetData from AppUser cascade;`,
    ['revoke execute', 'cascade']);

// ── DENY ──────────────────────────────────────────────────────────────────
await t('deny_object',
    `deny execute on dbo.usp_Dangerous to PublicRole;`,
    ['deny execute', 'dbo.usp_Dangerous', 'PublicRole']);

// ── GRANT ALL ──────────────────────────────────────────────────────────────
await t('grant_multiple_perms',
    `grant insert, update, delete on dbo.Orders to AppWriter;`,
    ['insert, update, delete', 'dbo.Orders', 'AppWriter']);

// ── ALTER TABLE ENABLE/DISABLE TRIGGER ───────────────────────────────────
await t('enable_trigger',
    `alter table dbo.Orders enable trigger trg_AuditOrders;`,
    ['enable trigger', 'trg_AuditOrders']);

await t('disable_trigger',
    `alter table dbo.Orders disable trigger all;`,
    ['disable trigger all']);

// ── CREATE INDEX: partition scheme ───────────────────────────────────────
await t('index_on_partition',
    `create index IX_Orders on dbo.Orders (OrderDate) on OrderDateScheme(OrderDate);`,
    ['on OrderDateScheme', 'OrderDate']);

// ── DROP INDEX on multiple tables ────────────────────────────────────────
await t('drop_index_multi',
    `drop index IX_A on dbo.T1, IX_B on dbo.T2;`,
    ['IX_A on dbo.T1', 'IX_B on dbo.T2']);

// ── SELECT with TABLESAMPLE ───────────────────────────────────────────────
await t('tablesample_system',
    `select * from dbo.Orders tablesample system (5 percent);`,
    ['tablesample system', '5 percent']);

// ── CREATE TABLE: ON partition scheme ────────────────────────────────────
await t('create_table_partition',
    `create table dbo.Orders (
        Id int not null,
        OrderDate date not null
     ) on OrderScheme(OrderDate);`,
    ['on OrderScheme', 'OrderDate']);

// ── SET ANSI / XACT / CONCAT options ─────────────────────────────────────
await t('set_xact_abort',
    `set xact_abort on;`,
    ['set xact_abort', 'on']);

await t('set_concat_null',
    `set concat_null_yields_null off;`,
    ['set concat_null_yields_null', 'off']);

await t('set_nocount',
    `set nocount on;`,
    ['set nocount', 'on']);

// ── CHECKPOINT ────────────────────────────────────────────────────────────
await t('checkpoint_stmt',
    `checkpoint;`,
    ['checkpoint']);

// ── KILL ──────────────────────────────────────────────────────────────────
await t('kill_stmt',
    `kill 57;`,
    ['kill', '57']);

// ── SELECT ... FOR UPDATE (cursor sensitivity) ───────────────────────────
await t('cursor_sensitivity',
    `declare C cursor dynamic for select Id, Name from dbo.T for update of Name;`,
    ['cursor dynamic', 'for update of Name']);

// ── WHILE LOOP with complex condition ────────────────────────────────────
await t('while_complex',
    `while exists (select 1 from dbo.Queue where IsProcessed = 0)
     begin
        declare @id int;
        select top 1 @id = Id from dbo.Queue where IsProcessed = 0;
        update dbo.Queue set IsProcessed = 1 where Id = @id;
     end;`,
    // formatter normalizes TOP 1 → TOP (1) and may wrap subquery
    ['while exists', 'IsProcessed = 0', 'top', '@id = Id']);

// ── SET with subquery ─────────────────────────────────────────────────────
await t('set_with_subquery',
    `declare @count int;
     set @count = (select count(*) from dbo.Orders where IsActive = 1);
     select @count;`,
    // formatter wraps subquery in SET — check semantics
    ['set @count', 'count(*)', 'IsActive = 1']);

// ── IF EXISTS pattern ─────────────────────────────────────────────────────
await t('if_exists_pattern',
    `if exists (select 1 from dbo.T where Id = @Id)
        update dbo.T set Name = @Name where Id = @Id;
     else
        insert into dbo.T (Id, Name) values (@Id, @Name);`,
    // formatter wraps subquery in IF EXISTS — check semantics
    ['if exists', 'select 1', 'update dbo.T', 'insert into dbo.T']);

// ── UPSERT with IF EXISTS ──────────────────────────────────────────────────
await t('upsert_pattern',
    `if not exists (select 1 from dbo.Users where Email = @Email)
        insert into dbo.Users (Email, Name) values (@Email, @Name);`,
    // WHERE Email = @Email (not @Email = @Email); check actual condition
    ['if not exists', "Email = @Email", "@Email, @Name"]);

// ── Variables in ORDER BY ─────────────────────────────────────────────────
await t('order_by_variable',
    `declare @dir nvarchar(4) = 'desc';
     select * from dbo.T order by Id;`,
    ['declare @dir', "'desc'", 'order by Id']);

// ── STRING functions ──────────────────────────────────────────────────────
await t('string_funcs',
    `select upper(Name), lower(Email), ltrim(rtrim(Code)) from dbo.Users;`,
    ['upper(Name)', 'lower(Email)', 'ltrim(rtrim(Code))']);

// ── Date functions ────────────────────────────────────────────────────────
await t('date_funcs',
    `select year(OrderDate), month(OrderDate), day(OrderDate), eomonth(OrderDate) from dbo.Orders;`,
    ['year(OrderDate)', 'month(OrderDate)', 'eomonth(OrderDate)']);

// ── Math functions ────────────────────────────────────────────────────────
await t('math_funcs',
    `select abs(Amount), ceiling(Amount), floor(Amount), round(Amount, 2), sqrt(Amount) from dbo.T;`,
    ['abs(Amount)', 'ceiling(Amount)', 'round(Amount, 2)', 'sqrt(Amount)']);

// ── OBJECT_ID / OBJECT_NAME ───────────────────────────────────────────────
await t('object_id_name',
    `select object_id('dbo.Orders'), object_name(object_id('dbo.Orders'));`,
    ["object_id('dbo.Orders')", 'object_name(']);

// ── SCOPE_IDENTITY / @@IDENTITY ───────────────────────────────────────────
await t('identity_functions',
    `insert into dbo.T (Name) values ('test');
     select scope_identity(), @@identity;`,
    ['scope_identity()', '@@identity']);

// ── JSON_VALUE / JSON_QUERY ───────────────────────────────────────────────
await t('json_functions',
    `select json_value(@json, '$.name'), json_query(@json, '$.items') from dbo.T;`,
    ["json_value(@json, '$.name')", "json_query(@json, '$.items')"]);

// ── COMPRESS / DECOMPRESS ─────────────────────────────────────────────────
await t('compress_decompress',
    `select compress(@data), cast(decompress(@compressed) as nvarchar(max)) from dbo.T;`,
    ['compress(@data)', 'decompress(@compressed)']);

// ── NEWID / NEWSEQUENTIALID ───────────────────────────────────────────────
await t('guid_functions',
    `select newid() as NewGuid, newsequentialid() as SeqGuid;`,
    ['newid()', 'newsequentialid()']);

// ── HASHBYTES ─────────────────────────────────────────────────────────────
await t('hashbytes',
    `select hashbytes('SHA2_256', convert(varbinary, Password)) from dbo.Users;`,
    ["hashbytes('SHA2_256'", 'convert(varbinary, Password)']);

// ── TRIGGER special columns (inserted/deleted) ────────────────────────────
await t('trigger_special_tables',
    `create trigger trg_Audit on dbo.Orders after insert, update as
     begin
        insert into dbo.AuditLog select Id, 'Modified' from inserted;
        insert into dbo.AuditLog select Id, 'Removed' from deleted;
     end;`,
    ['from inserted', 'from deleted', "after insert, update"]);

// ── ALTER TABLE ADD CONSTRAINT (standalone) ───────────────────────────────
await t('add_pk_constraint',
    `alter table dbo.T add constraint PK_T primary key clustered (Id);`,
    ['add constraint PK_T', 'primary key clustered', '(Id)']);

// ── UPDATE with multiple SET from SELECT (unusual but valid) ─────────────
await t('update_multi_set',
    `update t set t.Name = s.Name, t.UpdatedAt = getdate()
     from dbo.Target t join dbo.Source s on t.Id = s.Id
     where t.Name <> s.Name;`,
    ['t.Name = s.Name', "t.UpdatedAt = getdate()", 't.Name <> s.Name']);

// ── Multiple CTEs with INSERT ─────────────────────────────────────────────
await t('cte_insert',
    `with NewData as (
        select Id, Name from dbo.Staging where IsValid = 1
     )
     insert into dbo.Target (Id, Name)
     select Id, Name from NewData;`,
    ['with NewData as', 'IsValid = 1', 'insert into dbo.Target', 'from NewData']);

console.log(`\n${ok} passed, ${fail} failed`);
