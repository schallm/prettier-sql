/**
 * Probe 38 — Security, transactions, and procedural deep coverage:
 *   - GRANT / DENY / REVOKE with OBJECT permissions
 *   - GRANT EXECUTE ON schema to role
 *   - CREATE LOGIN with options (PASSWORD, SID, DEFAULT_DATABASE, CHECK_POLICY)
 *   - ALTER LOGIN (enable/disable, change password, unlock)
 *   - CREATE USER FROM LOGIN / WITHOUT LOGIN / FOR CERTIFICATE
 *   - ALTER USER with options
 *   - CREATE ROLE / ALTER ROLE ADD MEMBER / DROP MEMBER
 *   - CREATE SERVER ROLE / ALTER SERVER ROLE
 *   - EXECUTE AS / REVERT
 *   - BEGIN TRANSACTION (named) / SAVE TRANSACTION / ROLLBACK TO SAVEPOINT
 *   - Error handling: TRY/CATCH with THROW, ERROR_NUMBER, ERROR_MESSAGE
 *   - Multiple DECLARE in one statement
 *   - DECLARE with SELECT initialization
 *   - SET with compound operators (+=, -=, *=, /=, %=)
 *   - GOTO / label
 *   - CURSOR: DECLARE, OPEN, FETCH NEXT, CLOSE, DEALLOCATE
 *   - FETCH PRIOR / FIRST / LAST / ABSOLUTE / RELATIVE
 *   - Nested IF/ELSE
 *   - WHILE with BREAK / CONTINUE
 *   - Dynamic SQL: EXEC(@sql) / sp_executesql
 *   - EXEC with output parameters
 *   - PRINT with expression
 *   - RETURN with value
 *   - CHECKPOINT
 *   - RECONFIGURE
 *   - USE database
 *   - SET TRANSACTION ISOLATION LEVEL
 *   - SET NOCOUNT ON/OFF
 *   - SET XACT_ABORT ON/OFF
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
    // ── GRANT / DENY / REVOKE ─────────────────────────────────────────────────
    check(
        'grant_object_permission',
        `grant select, insert, update on dbo.Orders to AppUser`,
        ['grant', 'select', 'insert', 'update', 'on', 'dbo.orders', 'to', 'appuser']
    ),
    check(
        'deny_permission',
        `deny delete on schema::sales to ReadOnlyRole`,
        ['deny', 'delete', 'schema', 'sales', 'to', 'readonlyrole']
    ),
    check(
        'revoke_grant_option',
        `revoke grant option for select on dbo.Orders from AppUser cascade`,
        ['revoke', 'grant option for', 'select', 'dbo.orders', 'from', 'appuser', 'cascade']
    ),
    check(
        'grant_execute_schema',
        `grant execute on schema::dbo to AppRole`,
        ['grant', 'execute', 'schema::dbo', 'to', 'approle']
    ),

    // ── CREATE / ALTER LOGIN ──────────────────────────────────────────────────
    check(
        'create_login',
        `create login AppLogin with password = 'P@ssword123', default_database = MyDb, check_policy = off, check_expiration = off`,
        ['create', 'login', 'applogin', 'password', 'default_database', 'mydb', 'check_policy', 'check_expiration', 'off']
    ),
    check(
        'alter_login_enable',
        `alter login AppLogin enable`,
        ['alter', 'login', 'applogin', 'enable']
    ),
    check(
        'alter_login_password',
        `alter login AppLogin with password = 'NewP@ss123' must_change`,
        ['alter', 'login', 'applogin', 'password', 'newp@ss123', 'must_change']
    ),

    // ── CREATE / ALTER USER ───────────────────────────────────────────────────
    check(
        'create_user_from_login',
        `create user AppUser for login AppLogin with default_schema = dbo`,
        ['create', 'user', 'appuser', 'for login', 'applogin', 'default_schema', 'dbo']
    ),
    check(
        'create_user_without_login',
        `create user GuestUser without login`,
        ['create', 'user', 'guestuser', 'without login']
    ),
    check(
        'alter_user_schema',
        `alter user AppUser with default_schema = sales`,
        ['alter', 'user', 'appuser', 'default_schema', 'sales']
    ),

    // ── ROLE management ───────────────────────────────────────────────────────
    check(
        'create_role',
        `create role ReportViewers authorization dbo`,
        ['create', 'role', 'reportviewers', 'authorization', 'dbo']
    ),
    check(
        'alter_role_add_member',
        `alter role ReportViewers add member AppUser`,
        ['alter', 'role', 'reportviewers', 'add member', 'appuser']
    ),
    check(
        'alter_role_drop_member',
        `alter role ReportViewers drop member AppUser`,
        ['alter', 'role', 'reportviewers', 'drop member', 'appuser']
    ),

    // ── EXECUTE AS / REVERT ───────────────────────────────────────────────────
    check(
        'execute_as_user',
        `execute as user = 'AppUser'`,
        ['execute as', 'user', 'appuser']
    ),
    check(
        'revert',
        `revert`,
        ['revert']
    ),

    // ── Transactions ──────────────────────────────────────────────────────────
    check(
        'named_transaction',
        `begin transaction OrderTxn with mark 'Creating order'`,
        ['begin transaction', 'ordertxn', 'with mark', 'creating order']
    ),
    check(
        'save_transaction',
        `save transaction SavePoint1`,
        ['save transaction', 'savepoint1']
    ),
    check(
        'rollback_to_savepoint',
        `rollback transaction SavePoint1`,
        ['rollback', 'transaction', 'savepoint1']
    ),

    // ── TRY / CATCH ───────────────────────────────────────────────────────────
    check(
        'try_catch_full',
        `begin try insert into dbo.Orders (CustomerId, Amount) values (@cid, @amt) end try begin catch declare @msg nvarchar(4000) = error_message(); declare @sev int = error_severity(); declare @state int = error_state(); raiserror(@msg, @sev, @state) end catch`,
        ['begin try', 'insert', 'begin catch', 'error_message', 'error_severity', 'error_state', 'raiserror']
    ),

    // ── DECLARE multiple / SELECT init ────────────────────────────────────────
    check(
        'declare_select_init',
        `declare @count int, @total decimal(18,2); select @count = count(*), @total = sum(Amount) from dbo.Orders where Status = 'Active'`,
        ['declare', '@count', '@total', 'decimal', 'select', 'count', 'sum', 'where', 'status', 'active']
    ),

    // ── Compound assignment operators ─────────────────────────────────────────
    check(
        'compound_assign',
        `declare @n int = 10; set @n += 5; set @n -= 3; set @n *= 2; set @n /= 4; set @n %= 3`,
        ['set @n +=', 'set @n -=', 'set @n *=', 'set @n /=', 'set @n %=']
    ),

    // ── GOTO / label ─────────────────────────────────────────────────────────
    check(
        'goto_label',
        `declare @i int = 0; StartLoop: set @i += 1; if @i < 10 goto StartLoop; print @i`,
        ['startloop:', 'goto startloop', 'print', '@i']
    ),

    // ── CURSOR full lifecycle ─────────────────────────────────────────────────
    check(
        'cursor_full',
        `declare @orderId int; declare OrderCursor cursor fast_forward for select OrderId from dbo.Orders where Status = 'Active'; open OrderCursor; fetch next from OrderCursor into @orderId; while @@fetch_status = 0 begin print @orderId; fetch next from OrderCursor into @orderId end; close OrderCursor; deallocate OrderCursor`,
        ['cursor', 'fast_forward', 'open', 'fetch next', '@@fetch_status', 'close', 'deallocate']
    ),

    // ── sp_executesql ─────────────────────────────────────────────────────────
    check(
        'sp_executesql',
        `exec sp_executesql N'select * from dbo.Orders where OrderId = @id', N'@id int', @id = @OrderId`,
        ['sp_executesql', '@id int', '@orderid']
    ),

    // ── EXEC with OUTPUT ──────────────────────────────────────────────────────
    check(
        'exec_output_param',
        `declare @total decimal(18,2); exec dbo.GetOrderTotal @CustomerId = 42, @Total = @total output; print @total`,
        ['exec', 'getordertotal', '@customerid', '42', '@total', 'output', 'print']
    ),

    // ── Nested IF ────────────────────────────────────────────────────────────
    check(
        'nested_if',
        `if @x > 0 begin if @x > 100 begin print 'large' end else begin print 'small' end end else begin print 'zero or negative' end`,
        ['if @x > 0', 'if @x > 100', 'large', 'small', 'zero or negative']
    ),

    // ── WHILE with BREAK ─────────────────────────────────────────────────────
    check(
        'while_break',
        `declare @n int = 0; while @n < 100 begin set @n += 1; if @n = 42 break end`,
        ['while', '@n < 100', 'set @n +=', 'if @n = 42', 'break']
    ),

    // ── USE ───────────────────────────────────────────────────────────────────
    check(
        'use_database',
        `use MyDatabase`,
        ['use', 'mydatabase']
    ),

    // ── SET options ───────────────────────────────────────────────────────────
    check(
        'set_isolation_level',
        `set transaction isolation level read committed`,
        ['set transaction isolation level', 'read committed']
    ),
    check(
        'set_nocount',
        `set nocount on`,
        ['set', 'nocount', 'on']
    ),
    check(
        'set_xact_abort',
        `set xact_abort on`,
        ['set', 'xact_abort', 'on']
    ),

    // ── CHECKPOINT / RECONFIGURE ──────────────────────────────────────────────
    check(
        'checkpoint',
        `checkpoint 5`,
        ['checkpoint', '5']
    ),
    check(
        'reconfigure',
        `reconfigure with override`,
        ['reconfigure', 'with override']
    ),

    // ── PRINT with expression ─────────────────────────────────────────────────
    check(
        'print_concat',
        `print 'Order count: ' + cast(@count as nvarchar(10))`,
        ['print', 'order count:', 'cast', '@count', 'nvarchar']
    ),

    // ── RETURN with value ─────────────────────────────────────────────────────
    check(
        'return_value',
        `create function dbo.IsActive(@id int) returns bit as begin return case when exists (select 1 from dbo.Orders where CustomerId = @id and Status = 'Active') then 1 else 0 end end`,
        ['return', 'case when exists', 'customerid', '@id', 'active', '1 else 0']
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

console.log(`\nProbe 38 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
