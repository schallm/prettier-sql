/**
 * Probe 39 — BACKUP/RESTORE, DBCC, ALTER DATABASE, and edge cases:
 *   - BACKUP DATABASE with options (COMPRESSION, STATS, FORMAT, INIT, CHECKSUM)
 *   - BACKUP DATABASE ... TO DISK / TAPE
 *   - RESTORE DATABASE with NORECOVERY, REPLACE, MOVE
 *   - RESTORE FILELISTONLY / HEADERONLY / VERIFYONLY
 *   - DBCC commands: CHECKDB, SHRINKFILE, SHRINKDATABASE, FREEPROCCACHE, DROPCLEANBUFFERS, INPUTBUFFER
 *   - ALTER DATABASE SET options (READ_ONLY, SINGLE_USER, EMERGENCY, MULTI_USER)
 *   - ALTER DATABASE MODIFY NAME
 *   - ALTER DATABASE COLLATE
 *   - ALTER DATABASE SET AUTO_CLOSE, PAGE_VERIFY, RECOVERY, COMPATIBILITY_LEVEL
 *   - CREATE DATABASE with log and data files
 *   - DROP DATABASE IF EXISTS
 *   - ALTER DATABASE SCOPED CONFIGURATION SET
 *   - KILL statement (session id, UOW)
 *   - WAITFOR (RECEIVE)
 *   - BULK INSERT
 *   - Partition functions: CREATE, ALTER (SPLIT, MERGE), DROP
 *   - Partition schemes: CREATE, ALTER (ADD FILEGROUP), DROP
 *   - ENABLE/DISABLE TRIGGER
 *   - UPDATE STATISTICS with options
 *   - CREATE STATISTICS with various options
 *   - WITH NOLOCK / UPDLOCK / XLOCK / ROWLOCK / PAGLOCK hints
 *   - OUTPUT clause in MERGE
 *   - MERGE with multiple WHEN clauses
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
    // ── BACKUP ────────────────────────────────────────────────────────────────
    check(
        'backup_with_options',
        `backup database MyDb to disk = 'C:\Backup\MyDb.bak' with compression, stats = 10, init, checksum`,
        ['backup', 'database', 'mydb', 'disk', 'mydb.bak', 'compression', 'stats', '10', 'init', 'checksum']
    ),
    check(
        'backup_log',
        `backup log MyDb to disk = 'C:\Backup\MyDb_log.bak' with norecovery`,
        ['backup', 'log', 'mydb', 'disk', 'norecovery']
    ),
    check(
        'backup_differential',
        `backup database MyDb to disk = 'C:\Backup\diff.bak' with differential, compression`,
        ['backup', 'database', 'mydb', 'disk', 'differential', 'compression']
    ),

    // ── RESTORE ───────────────────────────────────────────────────────────────
    check(
        'restore_with_options',
        `restore database MyDb from disk = 'C:\Backup\MyDb.bak' with norecovery, replace, stats = 5`,
        ['restore', 'database', 'mydb', 'disk', 'norecovery', 'replace', 'stats', '5']
    ),
    check(
        'restore_with_move',
        `restore database MyDb from disk = 'C:\Backup\MyDb.bak' with move 'MyDb_Data' to 'D:\Data\MyDb.mdf', move 'MyDb_Log' to 'L:\Log\MyDb.ldf', recovery`,
        ['restore', 'with move', 'mydb_data', 'd:\\data\\mydb.mdf', 'mydb_log', 'recovery']
    ),

    // ── DBCC ──────────────────────────────────────────────────────────────────
    check(
        'dbcc_checkdb',
        `dbcc checkdb ('MyDb') with no_infomsgs, all_errormsgs`,
        ['dbcc', 'checkdb', 'mydb', 'no_infomsgs', 'all_errormsgs']
    ),
    check(
        'dbcc_shrinkfile',
        `dbcc shrinkfile (MyDb_Data, 100)`,
        ['dbcc', 'shrinkfile', 'mydb_data', '100']
    ),
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

    // ── ALTER DATABASE ────────────────────────────────────────────────────────
    check(
        'alter_db_set_single_user',
        `alter database MyDb set single_user with rollback immediate`,
        ['alter database', 'mydb', 'set single_user', 'rollback immediate']
    ),
    check(
        'alter_db_set_read_only',
        `alter database MyDb set read_only`,
        ['alter database', 'mydb', 'set read_only']
    ),
    check(
        'alter_db_set_multi_user',
        `alter database MyDb set multi_user`,
        ['alter database', 'mydb', 'set multi_user']
    ),
    check(
        'alter_db_modify_name',
        `alter database OldName modify name = NewName`,
        ['alter database', 'oldname', 'modify name', 'newname']
    ),
    check(
        'alter_db_collate',
        `alter database MyDb collate SQL_Latin1_General_CP1_CI_AS`,
        ['alter database', 'mydb', 'collate', 'sql_latin1_general_cp1_ci_as']
    ),
    check(
        'alter_db_scoped_config',
        `alter database scoped configuration set maxdop = 4`,
        ['alter database scoped configuration', 'set', 'maxdop', '4']
    ),

    // ── CREATE DATABASE ───────────────────────────────────────────────────────
    check(
        'create_database_basic',
        `create database NewDb`,
        ['create database', 'newdb']
    ),
    check(
        'drop_database_if_exists',
        `drop database if exists OldDb`,
        ['drop database', 'if exists', 'olddb']
    ),

    // ── Table hints ───────────────────────────────────────────────────────────
    check(
        'nolock_hint',
        `select * from dbo.Orders with (nolock) where OrderDate >= '2024-01-01'`,
        ['with', 'nolock', 'where', 'orderdate']
    ),
    check(
        'updlock_hint',
        `select * from dbo.Orders with (updlock, rowlock) where OrderId = @id`,
        ['updlock', 'rowlock', 'orderid']
    ),
    check(
        'xlock_paglock',
        `select * from dbo.Orders with (xlock, paglock) where OrderId = @id`,
        ['xlock', 'paglock']
    ),

    // ── MERGE with OUTPUT ─────────────────────────────────────────────────────
    check(
        'merge_with_output',
        `merge dbo.Customers t using @src s on t.Id = s.Id when matched then update set t.Name = s.Name when not matched then insert (Id, Name) values (s.Id, s.Name) output $action, inserted.Id, deleted.Name;`,
        ['merge', '$action', 'inserted.id', 'deleted.name', 'output']
    ),

    // ── BULK INSERT ───────────────────────────────────────────────────────────
    check(
        'bulk_insert',
        `bulk insert dbo.Orders from 'C:\Data\orders.csv' with (fieldterminator = ',', rowterminator = '\n', firstrow = 2, tablock)`,
        ['bulk insert', 'orders', 'fieldterminator', 'rowterminator', 'firstrow', 'tablock']
    ),

    // ── Partition operations ──────────────────────────────────────────────────
    check(
        'alter_partition_function_split',
        `alter partition function OrdersByYear() split range (2025)`,
        ['alter partition function', 'ordersbyyear', 'split range', '2025']
    ),
    check(
        'alter_partition_function_merge',
        `alter partition function OrdersByYear() merge range (2020)`,
        ['alter partition function', 'ordersbyyear', 'merge range', '2020']
    ),
    check(
        'alter_partition_scheme',
        `alter partition scheme OrdersByYearScheme next used [NewFileGroup]`,
        ['alter partition scheme', 'ordersbyyearscheme', 'next used']
    ),

    // ── ENABLE/DISABLE TRIGGER ────────────────────────────────────────────────
    check(
        'enable_trigger',
        `enable trigger trgAudit on dbo.Orders`,
        ['enable', 'trigger', 'trgaudit', 'on', 'dbo.orders']
    ),
    check(
        'disable_trigger_all',
        `disable trigger all on database`,
        ['disable', 'trigger', 'all', 'on', 'database']
    ),

    // ── UPDATE STATISTICS ─────────────────────────────────────────────────────
    check(
        'update_stats_fullscan',
        `update statistics dbo.Orders with fullscan, norecompute`,
        ['update statistics', 'dbo.orders', 'fullscan', 'norecompute']
    ),
    check(
        'update_stats_sample',
        `update statistics dbo.Orders IX_Orders with sample 30 percent`,
        ['update statistics', 'ix_orders', 'sample', '30', 'percent']
    ),

    // ── KILL ──────────────────────────────────────────────────────────────────
    check(
        'kill_session',
        `kill 55`,
        ['kill', '55']
    ),
    check(
        'kill_with_statusonly',
        `kill 55 with statusonly`,
        ['kill', '55', 'with statusonly']
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

console.log(`\nProbe 39 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
