/**
 * Fourth semantic-safety probe — security, admin, and specialized constructs.
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

// ── MERGE: multiple WHEN clauses + DELETE ─────────────────────────────────
await t('merge_full',
    `merge dbo.Target as t
     using dbo.Source as s on t.Id = s.Id
     when matched and t.Name <> s.Name then
         update set t.Name = s.Name, t.Updated = getdate()
     when matched and s.IsDeleted = 1 then
         delete
     when not matched by target then
         insert (Id, Name) values (s.Id, s.Name)
     when not matched by source then
         delete;`,
    ['when matched', 'delete', 'when not matched by target', 'when not matched by source',
     'insert (Id, Name)', 'values (s.Id, s.Name)']);

// ── CREATE LOGIN ──────────────────────────────────────────────────────────
await t('create_login_windows',
    `create login [DOMAIN\User] from windows with default_database = master;`,
    ['create login', 'from windows', 'default_database = master']);

await t('create_login_password',
    `create login AppUser with password = 'P@ssw0rd!' must_change, check_policy = on;`,
    ['create login', 'AppUser', 'must_change', 'check_policy = on']);

// ── ALTER LOGIN ───────────────────────────────────────────────────────────
await t('alter_login_disable',
    `alter login AppUser disable;`,
    ['alter login', 'AppUser', 'disable']);

await t('alter_login_password',
    `alter login AppUser with password = 'NewP@ss!' old_password = 'OldP@ss!';`,
    ['alter login', 'password =', 'old_password =']);

// ── CREATE USER ───────────────────────────────────────────────────────────
await t('create_user',
    `create user AppUser for login AppUser with default_schema = dbo;`,
    ['create user', 'for login AppUser', 'default_schema = dbo']);

// ── ALTER USER ────────────────────────────────────────────────────────────
await t('alter_user',
    `alter user OldName with name = NewName, default_schema = sales;`,
    ['alter user', 'name = NewName', 'default_schema = sales']);

// ── CREATE ROLE / ALTER ROLE ───────────────────────────────────────────────
await t('create_role',
    `create role DataReader authorization dbo;`,
    ['create role', 'DataReader', 'authorization dbo']);

await t('alter_role_add',
    `alter role DataReader add member AppUser;`,
    ['alter role DataReader', 'add member AppUser']);

await t('alter_role_drop',
    `alter role DataReader drop member AppUser;`,
    ['drop member AppUser']);

// ── GRANT / REVOKE / DENY ─────────────────────────────────────────────────
await t('grant_with_grant_option',
    `grant select on dbo.Orders to AppUser with grant option;`,
    ['with grant option', 'AppUser']);

await t('revoke_cascade',
    `revoke grant option for select on dbo.Orders from AppUser cascade;`,
    ['revoke', 'grant option for', 'cascade']);

await t('deny_stmt',
    `deny delete on dbo.Orders to AppUser;`,
    ['deny', 'delete', 'dbo.Orders', 'AppUser']);

// ── EXECUTE AS / REVERT ───────────────────────────────────────────────────
await t('execute_as',
    `execute as user = 'dbo';`,
    ['execute as user', "'dbo'"]);

await t('revert_stmt',
    `revert;`,
    ['revert']);

// ── DBCC ─────────────────────────────────────────────────────────────────
await t('dbcc_checkdb',
    `dbcc checkdb ('MyDB') with no_infomsgs;`,
    ['dbcc checkdb', 'MyDB', 'no_infomsgs']);

await t('dbcc_shrinkfile',
    `dbcc shrinkfile (1, 100);`,
    ['dbcc shrinkfile']);

// ── BACKUP DATABASE ───────────────────────────────────────────────────────
await t('backup_database',
    `backup database MyDB to disk = 'C:\Backup\MyDB.bak' with compression, stats = 10;`,
    ['backup database', 'to disk', 'compression', 'stats = 10']);

// ── RESTORE DATABASE ──────────────────────────────────────────────────────
await t('restore_database',
    `restore database MyDB from disk = 'C:\Backup\MyDB.bak' with replace, recovery;`,
    ['restore database', 'from disk', 'replace', 'recovery']);

// ── BULK INSERT options ────────────────────────────────────────────────────
await t('bulk_insert_options',
    `bulk insert dbo.Staging from 'C:\data\file.csv'
     with (fieldterminator = ',', rowterminator = '\n', firstrow = 2, tablock);`,
    ['fieldterminator', 'rowterminator', 'firstrow = 2', 'tablock']);

// ── CREATE CERTIFICATE ────────────────────────────────────────────────────
await t('create_cert',
    `create certificate MyCert with subject = 'Test Certificate';`,
    ['create certificate', 'MyCert', "subject = 'Test Certificate'"]);

// ── CREATE / DROP DATABASE ────────────────────────────────────────────────
await t('create_database',
    `create database MyDB;`,
    ['create database', 'MyDB']);

await t('drop_database',
    `drop database if exists MyDB;`,
    ['drop database', 'if exists', 'MyDB']);

// ── USE ───────────────────────────────────────────────────────────────────
await t('use_stmt',
    `use MyDatabase;`,
    ['use', 'MyDatabase']);

// ── SET TRANSACTION ISOLATION LEVEL ──────────────────────────────────────
await t('set_isolation',
    `set transaction isolation level read uncommitted;`,
    ['set transaction isolation level', 'read uncommitted']);

// ── BEGIN / COMMIT / ROLLBACK TRANSACTION ─────────────────────────────────
await t('transaction_named',
    `begin transaction MyTxn; commit transaction MyTxn;`,
    ['begin transaction MyTxn', 'commit transaction MyTxn']);

await t('transaction_rollback',
    `begin transaction; rollback transaction;`,
    ['begin transaction', 'rollback transaction']);

await t('savepoint',
    `save transaction MySavepoint;`,
    ['save transaction', 'MySavepoint']);

// ── LINKED SERVER four-part name ──────────────────────────────────────────
await t('linked_server_query',
    `select * from RemoteSrv.SalesDB.dbo.Orders where OrderDate > '2024-01-01';`,
    ['RemoteSrv.SalesDB.dbo.Orders', "OrderDate > '2024-01-01'"]);

// ── XML methods ───────────────────────────────────────────────────────────
await t('xml_value_method',
    `select @xml.value('(/root/item/@id)[1]', 'int');`,
    ['xml', ".value('", 'int']);

await t('xml_query_method',
    `select @xml.query('/root/item[@id=1]');`,
    [".query('", '/root/item']);

// ── CONTAINS / FREETEXT ───────────────────────────────────────────────────
await t('contains_predicate',
    `select * from dbo.Articles where contains(Body, '"database" AND "performance"');`,
    ['contains', 'Body', '"database"']);

await t('freetext_predicate',
    `select * from dbo.Articles where freetext(*, 'database performance');`,
    ['freetext', "'database performance'"]);

// ── SET ANSI_NULLS / SET QUOTED_IDENTIFIER ───────────────────────────────
await t('set_ansi_nulls',
    `set ansi_nulls on;`,
    ['set ansi_nulls', 'on']);

await t('set_quoted_identifier',
    `set quoted_identifier off;`,
    ['set quoted_identifier', 'off']);

// ── CREATE ASSEMBLY ───────────────────────────────────────────────────────
await t('create_assembly',
    `create assembly MyAssembly from 'C:\assemblies\MyAssembly.dll' with permission_set = safe;`,
    ['create assembly', 'MyAssembly', 'permission_set = safe']);

// ── sp_rename ─────────────────────────────────────────────────────────────
await t('sp_rename_exec',
    `exec sp_rename 'dbo.OldTable', 'NewTable', 'OBJECT';`,
    ['sp_rename', 'OldTable', 'NewTable', "'OBJECT'"]);

// ── TABLESAMPLE ───────────────────────────────────────────────────────────
await t('tablesample',
    `select * from dbo.Orders tablesample (10 percent);`,
    ['tablesample', '10 percent']);

// ── READ PAST hint ────────────────────────────────────────────────────────
await t('readpast_hint',
    `select top 1 * from dbo.Queue with (readpast, updlock) where IsProcessed = 0;`,
    // TOP (1) with parens is the normalized form — both are valid T-SQL
    ['readpast', 'updlock', 'top']);

// ── NOLOCK hint ───────────────────────────────────────────────────────────
await t('nolock_hint',
    `select * from dbo.Orders with (nolock) where Year = 2024;`,
    ['with (nolock)']);

// ── Schema-qualified functions ─────────────────────────────────────────────
await t('schema_fn_call',
    `select dbo.fn_GetPrice(ProductId, 'USD') from dbo.Products;`,
    ['dbo.fn_GetPrice', 'ProductId', "'USD'"]);

console.log(`\n${ok} passed, ${fail} failed`);
