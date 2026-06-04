/**
 * Second semantic-safety probe — more data-loss candidates.
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

// ── CREATE TABLE ON filegroup ──────────────────────────────────────────────
await t('create_table_on_filegroup',
    `create table dbo.Orders (Id int primary key) on [PRIMARY];`,
    ['on', 'PRIMARY']);

// ── CREATE TABLE ON partition scheme ──────────────────────────────────────
await t('create_table_on_partition',
    `create table dbo.Orders (
        Id int not null,
        OrderDate date not null
     ) on PartScheme(OrderDate);`,
    ['on PartScheme', 'OrderDate']);

// ── WITH NOCHECK ───────────────────────────────────────────────────────────
await t('alter_table_with_nocheck',
    `alter table dbo.Orders with nocheck add
        constraint FK_Cust foreign key (CustId) references dbo.Customers(Id);`,
    ['with nocheck', 'foreign key', 'FK_Cust']);

await t('alter_table_with_check',
    `alter table dbo.Orders with check add
        constraint CK_Amt check (Amount > 0);`,
    ['with check', 'check (', 'CK_Amt']);

// ── NOCHECK / CHECK constraint ─────────────────────────────────────────────
await t('alter_nocheck_constraint',
    `alter table dbo.Orders nocheck constraint FK_Cust;`,
    ['nocheck constraint', 'FK_Cust']);

await t('alter_check_constraint_all',
    `alter table dbo.Orders check constraint all;`,
    ['check constraint all']);

// ── ALTER TABLE: ADD column with ROWGUIDCOL, COLLATE ──────────────────────
await t('alter_add_col_collate',
    `alter table dbo.Products add
        Name nvarchar(200) collate Latin1_General_CI_AS null;`,
    ['collate', 'Latin1_General_CI_AS']);

await t('alter_add_col_rowguid',
    `alter table dbo.Products add
        RowGuid uniqueidentifier rowguidcol not null default newid();`,
    ['rowguidcol', 'newid()']);

// ── COLUMN SET FOR ALL_SPARSE_COLUMNS ────────────────────────────────────
await t('column_set',
    `create table dbo.Attrs (
        Id int primary key,
        AllSparse xml column_set for all_sparse_columns
     );`,
    ['column_set for all_sparse_columns']);

// ── FILESTREAM ────────────────────────────────────────────────────────────
await t('filestream_column',
    `create table dbo.Docs (
        Id uniqueidentifier rowguidcol not null primary key,
        Content varbinary(max) filestream null
     );`,
    ['filestream']);

// ── MASKED WITH ───────────────────────────────────────────────────────────
await t('masked_with',
    `create table dbo.Users (
        Id int primary key,
        Email nvarchar(100) masked with (function = 'email()') null,
        Phone nvarchar(20) masked with (function = 'partial(0,"XXX-XXX-",4)') null
     );`,
    ["masked with (function = 'email()')", "partial(0"]);

// ── ENCRYPTED WITH ────────────────────────────────────────────────────────
await t('encrypted_with',
    `create table dbo.Sensitive (
        Id int primary key,
        SSN nvarchar(11) encrypted with (
            column_encryption_key = MyCEK,
            encryption_type = deterministic,
            algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256'
        ) null
     );`,
    ['encrypted with', 'column_encryption_key', 'deterministic', 'AEAD_AES_256']);

// ── ALTER COLUMN SET MASKED ────────────────────────────────────────────────
await t('alter_col_masked',
    `alter table dbo.Users alter column Phone add masked with (function = 'default()');`,
    ['masked with', "function = 'default()'"],
);

// ── Generated columns ─────────────────────────────────────────────────────
await t('computed_column',
    `create table dbo.Products (
        Price decimal(10,2),
        Tax decimal(10,2),
        Total as (Price + Tax) persisted not null
     );`,
    ['as (Price + Tax)', 'persisted']);

// ── Computed column non-persisted ─────────────────────────────────────────
await t('computed_col_non_persisted',
    `create table dbo.T (
        A int, B int,
        C as (A + B)
     );`,
    ['as (A + B)']);

// ── CREATE TABLE: TEXTIMAGE_ON ────────────────────────────────────────────
await t('textimage_on',
    `create table dbo.T (Id int, Data text) textimage_on [PRIMARY];`,
    ['textimage_on', 'PRIMARY']);

// ── FK: multiple columns ──────────────────────────────────────────────────
await t('fk_multi_column',
    `create table dbo.OrderLines (
        OrderId int not null,
        LineId int not null,
        RefOrderId int,
        RefLineId int,
        constraint FK_Ref foreign key (RefOrderId, RefLineId)
            references dbo.OrderLines (OrderId, LineId)
     );`,
    ['RefOrderId, RefLineId', 'references dbo.OrderLines (OrderId, LineId)']);

// ── UNIQUE with CLUSTERED ─────────────────────────────────────────────────
await t('unique_clustered',
    `create table dbo.T (
        Id int not null,
        constraint UQ_Id unique clustered (Id)
     );`,
    ['unique clustered', 'UQ_Id']);

// ── PRIMARY KEY with FILLFACTOR ───────────────────────────────────────────
await t('pk_with_fillfactor',
    `create table dbo.T (
        Id int not null,
        constraint PK_T primary key clustered (Id) with (fillfactor = 90)
     );`,
    ['fillfactor = 90', 'primary key clustered']);

// ── Inline column constraints: named PRIMARY KEY ──────────────────────────
await t('named_inline_pk',
    `create table dbo.T (
        Id int not null constraint PK_T primary key clustered
     );`,
    ['constraint PK_T', 'primary key clustered']);

// ── ALTER TABLE DROP COLUMN ───────────────────────────────────────────────
await t('alter_drop_column',
    `alter table dbo.Orders drop column ArchivedAt, Notes;`,
    ['drop column', 'ArchivedAt', 'Notes']);

// ── GRANT column-level ────────────────────────────────────────────────────
await t('grant_column_level',
    `grant select (OrderId, Amount), update (Amount) on dbo.Orders to AppUser;`,
    ['select (OrderId, Amount)', 'update (Amount)', 'AppUser']);

// ── REVOKE column-level ───────────────────────────────────────────────────
await t('revoke_column_level',
    `revoke select (SSN) on dbo.Users from ReadRole;`,
    ['select (SSN)', 'ReadRole']);

// ── EXECUTE AS clause on procedure ────────────────────────────────────────
await t('proc_execute_as',
    `create procedure dbo.usp_Test with schemabinding, execute as 'dbo' as begin select 1; end;`,
    ['schemabinding', "execute as 'dbo'"]);

// ── ALTER PROCEDURE ───────────────────────────────────────────────────────
await t('alter_procedure',
    `alter procedure dbo.usp_Test @Id int as begin select @Id; end;`,
    ['alter procedure', '@Id int']);

// ── DROP PROCEDURE IF EXISTS ──────────────────────────────────────────────
await t('drop_proc_if_exists',
    `drop procedure if exists dbo.usp_Test;`,
    ['if exists', 'dbo.usp_Test']);

// ── RETURN inside proc ────────────────────────────────────────────────────
await t('return_in_proc',
    `create procedure dbo.GetStatus @Id int as
     begin
        if @Id = 0 return -1;
        return 0;
     end;`,
    ['return -1', 'return 0']);

console.log(`\n${ok} passed, ${fail} failed`);
