/**
 * Probe 31 — SSMS-generated script patterns:
 *   GO batches, multiple statements per batch, USE with GO,
 *   SET options block at top of scripts, sp_configure,
 *   PRINT with concatenation, system function calls,
 *   @@SERVERNAME / @@VERSION / @@SPID,
 *   OBJECT_DEFINITION, SCHEMA_NAME, DB_NAME, USER_NAME,
 *   SUSER_NAME / SUSER_SNAME / ORIGINAL_LOGIN,
 *   ALTER DATABASE with multiple SET options,
 *   CREATE ROLE / ALTER ROLE / DROP ROLE,
 *   ALTER USER, DROP USER, DENY/GRANT on schema,
 *   EXECUTE as command (not stored proc),
 *   CREATE TABLE with multiple inline FK/PK/CHECK constraints,
 *   ADD MULTIPLE columns in one ALTER TABLE,
 *   binary literal, hex literal, N'unicode' string,
 *   multi-line string, special characters in identifiers
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
    // ── System globals ────────────────────────────────────────────────────────
    check(
        'system_globals',
        `select @@servername, @@version, @@spid, @@language, @@max_connections`,
        ['@@servername', '@@version', '@@spid', '@@language', '@@max_connections']
    ),
    check(
        'db_name',
        `select db_name(), user_name(), schema_name(), schema_name(schema_id('dbo'))`,
        ['db_name', 'user_name', 'schema_name', 'schema_id', 'dbo']
    ),
    check(
        'suser_name',
        `select suser_sname(), suser_name(), original_login(), system_user, current_user`,
        ['suser_sname', 'suser_name', 'original_login', 'system_user', 'current_user']
    ),

    // ── Object metadata functions ─────────────────────────────────────────────
    check(
        'object_definition',
        `select object_definition(object_id('dbo.GetOrder'))`,
        ['object_definition', 'object_id', 'dbo.getorder']
    ),
    check(
        'objectproperty',
        `select objectproperty(object_id('dbo.Orders'), 'IsUserTable'), objectproperty(object_id('dbo.GetOrder'), 'IsProcedure')`,
        ['objectproperty', 'object_id', 'isusertable', 'isprocedure']
    ),

    // ── Binary and hex literals ───────────────────────────────────────────────
    check(
        'binary_literal',
        `select 0x1A2B3C4D, 0xFF`,
        ['0x1a2b3c4d', '0xff']
    ),
    check(
        'binary_column',
        `create table dbo.Keys (Id int not null, Salt binary(16) not null default (0x00000000000000000000000000000000), Hash varbinary(32) not null)`,
        ['binary', '16', 'default', '0x00000000000000000000000000000000', 'varbinary', '32']
    ),

    // ── Unicode string ────────────────────────────────────────────────────────
    check(
        'unicode_string',
        `select N'Hello, World! こんにちは' as Greeting`,
        ["n'hello, world!", 'greeting']
    ),

    // ── CREATE ROLE / ALTER ROLE ──────────────────────────────────────────────
    check(
        'create_role',
        `create role DataReader authorization dbo`,
        ['create', 'role', 'datareader', 'authorization', 'dbo']
    ),
    check(
        'alter_role_add_member',
        `alter role DataReader add member AppUser`,
        ['alter', 'role', 'datareader', 'add', 'member', 'appuser']
    ),
    check(
        'alter_role_drop_member',
        `alter role DataReader drop member AppUser`,
        ['alter', 'role', 'datareader', 'drop', 'member', 'appuser']
    ),
    check(
        'drop_role',
        `drop role if exists DataReader`,
        ['drop', 'role', 'if', 'exists', 'datareader']
    ),

    // ── GRANT/DENY/REVOKE on schema ───────────────────────────────────────────
    check(
        'grant_on_schema',
        `grant select, insert, update, delete on schema::dbo to AppUser`,
        ['grant', 'select', 'insert', 'update', 'delete', 'on', 'schema', 'dbo', 'to', 'appuser']
    ),
    check(
        'grant_execute_on_schema',
        `grant execute on schema::dbo to AppUser`,
        ['grant', 'execute', 'on', 'schema', 'dbo', 'to', 'appuser']
    ),

    // ── ALTER USER ────────────────────────────────────────────────────────────
    check(
        'alter_user',
        `alter user AppUser with default_schema = Sales`,
        ['alter', 'user', 'appuser', 'with', 'default_schema', 'sales']
    ),
    check(
        'alter_user_name',
        `alter user AppUser with name = AppUser2`,
        ['alter', 'user', 'appuser', 'with', 'name', 'appuser2']
    ),
    check(
        'drop_user',
        `drop user if exists AppUser`,
        ['drop', 'user', 'if', 'exists', 'appuser']
    ),

    // ── sp_configure ──────────────────────────────────────────────────────────
    check(
        'sp_configure',
        `exec sp_configure 'show advanced options', 1; reconfigure`,
        ['sp_configure', 'show advanced options', '1', 'reconfigure']
    ),
    check(
        'reconfigure_with_override',
        `reconfigure with override`,
        ['reconfigure', 'with', 'override']
    ),

    // ── ALTER DATABASE multiple SET options ───────────────────────────────────
    check(
        'alter_db_compatibility_level',
        `alter database MyDb set compatibility_level = 150`,
        ['alter', 'database', 'mydb', 'set', 'compatibility_level', '150']
    ),
    check(
        'alter_db_allow_snapshot',
        `alter database MyDb set allow_snapshot_isolation on`,
        ['allow_snapshot_isolation', 'on']
    ),
    check(
        'alter_db_read_committed_snapshot',
        `alter database MyDb set read_committed_snapshot on`,
        ['read_committed_snapshot', 'on']
    ),

    // ── CREATE TABLE with multiple inline constraints ─────────────────────────
    check(
        'create_table_inline_constraints',
        `create table dbo.LineItems (
            LineId int not null identity(1,1) constraint PK_LineItems primary key,
            OrderId int not null constraint FK_LineItems_Order foreign key references dbo.Orders(OrderId) on delete cascade,
            ProductId int not null,
            Quantity int not null constraint CHK_Qty check (Quantity > 0),
            UnitPrice decimal(10,2) not null,
            constraint UQ_LineItems_OrderProduct unique (OrderId, ProductId)
        )`,
        ['identity', '1', '1', 'pk_lineitems', 'primary', 'fk_lineitems_order', 'foreign', 'references', 'dbo.orders', 'on', 'delete', 'cascade', 'chk_qty', 'check', 'quantity', 'uq_lineitems_orderproduct', 'unique']
    ),

    // ── ADD MULTIPLE columns in one ALTER TABLE ───────────────────────────────
    check(
        'alter_add_multiple_columns',
        `alter table dbo.Orders add CreatedBy nvarchar(100) not null default (suser_sname()), ModifiedDate datetime2 null, IsDeleted bit not null default (0)`,
        ['add', 'createdby', 'nvarchar', 'suser_sname', 'modifieddate', 'datetime2', 'isdeleted', 'bit', 'default', '0']
    ),

    // ── COLLATE database default ───────────────────────────────────────────────
    check(
        'create_db_collate',
        `create database MyDb collate Latin1_General_CI_AS`,
        ['create', 'database', 'mydb', 'collate', 'latin1_general_ci_as']
    ),

    // ── CROSS APPLY with VALUES ───────────────────────────────────────────────
    check(
        'cross_apply_values_multi',
        `select o.OrderId, v.Col, v.Val from dbo.Orders o cross apply (values ('Amount', cast(o.Amount as nvarchar)), ('Status', o.Status)) v(Col, Val)`,
        ['cross', 'apply', 'values', 'amount', 'status', 'col', 'val']
    ),

    // ── STRING_SPLIT with ordinal ─────────────────────────────────────────────
    check(
        'string_split_ordinal',
        `select value, ordinal from string_split('a,b,c', ',', 1)`,
        ['string_split', 'value', 'ordinal']
    ),

    // ── TRIM / LTRIM / RTRIM ──────────────────────────────────────────────────
    check(
        'trim',
        `select trim(' ' from Name), ltrim(Name), rtrim(Name) from dbo.Customers`,
        ['trim', "' '", 'ltrim', 'rtrim', 'name']
    ),

    // ── TRANSLATE ────────────────────────────────────────────────────────────
    check(
        'translate',
        `select translate(PhoneNumber, '()-. ', '') from dbo.Customers`,
        ['translate', 'phonenumber']
    ),

    // ── STRING_ESCAPE ─────────────────────────────────────────────────────────
    check(
        'string_escape',
        `select string_escape(Notes, 'json') from dbo.Orders`,
        ['string_escape', 'notes', 'json']
    ),

    // ── CONCAT / CONCAT_WS ────────────────────────────────────────────────────
    check(
        'concat',
        `select concat(FirstName, ' ', LastName) as FullName from dbo.Customers`,
        ['concat', 'firstname', 'lastname', 'fullname']
    ),
    check(
        'concat_ws',
        `select concat_ws(', ', City, State, Country) as Address from dbo.Customers`,
        ['concat_ws', "', '", 'city', 'state', 'country', 'address']
    ),

    // ── REPLICATE / SPACE / LEN / DATALENGTH ─────────────────────────────────
    check(
        'string_functions',
        `select replicate('0', 10 - len(Code)) + Code, space(5), datalength(Name) from dbo.Products`,
        ['replicate', "\'0\'", 'len', 'code', 'space', '5', 'datalength', 'name']
    ),

    // ── CAST / CONVERT with MAX ────────────────────────────────────────────────
    check(
        'cast_nvarchar_max',
        `select cast(Notes as nvarchar(max)) from dbo.Orders`,
        ['cast', 'notes', 'nvarchar(max)']
    ),

    // ── OUTER APPLY with subquery ──────────────────────────────────────────────
    check(
        'outer_apply_subquery',
        `select c.CustomerId, o.LastOrderDate from dbo.Customers c outer apply (select max(OrderDate) as LastOrderDate from dbo.Orders where CustomerId = c.CustomerId) o`,
        ['outer', 'apply', 'max(orderdate)', 'lastorderdate', 'customerid']
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

console.log(`\nProbe 31 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
