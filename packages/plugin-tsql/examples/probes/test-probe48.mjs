/**
 * Probe 48 — Security, Service Broker, Full-Text Search DDL,
 *   linked servers, server objects, certificates, keys,
 *   database mail, resource governor, data compression,
 *   stretch database (legacy), transparent data encryption,
 *   Always Encrypted, row-level security,
 *   dynamic data masking, temporal tables,
 *   CREATE/DROP DATABASE, CREATE/ALTER/DROP LOGIN,
 *   CREATE/ALTER/DROP USER, CREATE/ALTER/DROP ROLE,
 *   CREATE/ALTER/DROP SERVER ROLE,
 *   EXECUTE AS / REVERT,
 *   CREATE MASTER KEY, CREATE CERTIFICATE,
 *   CREATE SYMMETRIC KEY / CREATE ASYMMETRIC KEY
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
    // ── CREATE / DROP DATABASE ────────────────────────────────────────────────
    check(
        'create_database_simple',
        `create database MyApp`,
        ['create database', 'myapp']
    ),
    check(
        'drop_database',
        `drop database if exists MyApp`,
        ['drop database', 'if exists', 'myapp']
    ),

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    check(
        'create_login_sql',
        `create login AppUser with password = N'P@ssword1!', default_database = MyApp, check_expiration = off, check_policy = on`,
        ['create login', 'appuser', 'password', 'p@ssword1!', 'default_database', 'myapp', 'check_expiration', 'check_policy']
    ),
    check(
        'alter_login_enable',
        `alter login AppUser enable`,
        ['alter login', 'appuser', 'enable']
    ),
    check(
        'alter_login_password',
        `alter login AppUser with password = N'NewPass2!'`,
        ['alter login', 'appuser', 'password', 'newpass2!']
    ),
    check(
        'drop_login',
        `drop login AppUser`,
        ['drop login', 'appuser']
    ),

    // ── USER ──────────────────────────────────────────────────────────────────
    check(
        'create_user',
        `create user AppUser for login AppUser with default_schema = dbo`,
        ['create user', 'appuser', 'for login', 'default_schema', 'dbo']
    ),
    check(
        'alter_user',
        `alter user AppUser with name = AppUser2, default_schema = sales`,
        ['alter user', 'appuser', 'name', 'appuser2', 'default_schema', 'sales']
    ),
    check(
        'drop_user',
        `drop user AppUser`,
        ['drop user', 'appuser']
    ),

    // ── ROLE ──────────────────────────────────────────────────────────────────
    check(
        'create_role',
        `create role ReportViewers authorization dbo`,
        ['create role', 'reportviewers', 'authorization', 'dbo']
    ),
    check(
        'alter_role_add_member',
        `alter role ReportViewers add member AppUser`,
        ['alter role', 'reportviewers', 'add member', 'appuser']
    ),
    check(
        'alter_role_drop_member',
        `alter role ReportViewers drop member AppUser`,
        ['alter role', 'reportviewers', 'drop member', 'appuser']
    ),
    check(
        'drop_role',
        `drop role ReportViewers`,
        ['drop role', 'reportviewers']
    ),

    // ── EXECUTE AS / REVERT ───────────────────────────────────────────────────
    check(
        'execute_as_login',
        `execute as login = 'AppUser'`,
        ['execute as login', 'appuser']
    ),
    check(
        'execute_as_user',
        `execute as user = 'AppUser'`,
        ['execute as user', 'appuser']
    ),
    check(
        'revert',
        `revert`,
        ['revert']
    ),

    // ── MASTER KEY ────────────────────────────────────────────────────────────
    check(
        'create_master_key',
        `create master key encryption by password = N'MasterP@ss1!'`,
        ['create master key', 'encryption by password', 'masterp@ss1!']
    ),

    // ── CERTIFICATE ───────────────────────────────────────────────────────────
    check(
        'create_certificate',
        `create certificate AppCert with subject = 'Application Certificate', expiry_date = '2030-01-01'`,
        ['create certificate', 'appcert', 'subject', 'application certificate', 'expiry_date']
    ),

    // ── Temporal table ────────────────────────────────────────────────────────
    check(
        'temporal_table',
        `create table dbo.Orders (OrderId int primary key, Amount decimal(18,2), ValidFrom datetime2 generated always as row start not null, ValidTo datetime2 generated always as row end not null, period for system_time (ValidFrom, ValidTo)) with (system_versioning = on (history_table = dbo.OrdersHistory))`,
        ['generated always as row start', 'generated always as row end', 'period for system_time', 'system_versioning', 'on', 'ordershistory']
    ),

    // ── Dynamic data masking ──────────────────────────────────────────────────
    check(
        'dynamic_data_masking',
        `create table dbo.Customers (Id int primary key, Email nvarchar(200) masked with (function = 'email()') not null, Phone nvarchar(20) masked with (function = 'partial(0,"XXXXXXXX",0)') null)`,
        ['masked with', 'function', 'email()', 'partial']
    ),

    // ── Row-level security ────────────────────────────────────────────────────
    check(
        'row_level_security',
        `create security policy dbo.OrdersPolicy add filter predicate dbo.fn_OrdersFilter(UserId) on dbo.Orders, add block predicate dbo.fn_OrdersFilter(UserId) on dbo.Orders after insert`,
        ['create security policy', 'orderspolicy', 'filter predicate', 'fn_ordersfilter', 'block predicate', 'after insert']
    ),

    // ── Always Encrypted ──────────────────────────────────────────────────────
    check(
        'always_encrypted_col',
        `create table dbo.Sensitive (Id int primary key, SSN nvarchar(11) collate Latin1_General_BIN2 encrypted with (column_encryption_key = SSN_CEK, encryption_type = Deterministic, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256') not null)`,
        ['encrypted with', 'column_encryption_key', 'ssn_cek', 'encryption_type', 'deterministic', 'algorithm']
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

console.log(`\nProbe 48 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
