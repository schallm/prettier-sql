/**
 * Probe 27 — INSERT EXEC, EXEC with return value, multi-part names in DML,
 *             CREATE TABLE with complex constraints, triggers (DML types),
 *             CREATE/ALTER LOGIN/USER, column-level check constraints,
 *             WITHIN GROUP, CUME_DIST/NTILE/PERCENT_RANK, TRY/CATCH details,
 *             RAISERROR with substitution params, FORMATMESSAGE
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
    // ── INSERT EXEC ───────────────────────────────────────────────────────────
    check(
        'insert_exec',
        `insert into #Results exec dbo.GetOrders @CustomerId = 1`,
        ['insert', 'into', '#results', 'exec', 'dbo.getorders', '@customerid']
    ),
    check(
        'insert_exec_string',
        `insert into #Results exec ('select Id, Name from dbo.Products')`,
        ['insert', 'into', '#results', 'exec', 'select id, name']
    ),

    // ── EXEC with return code capture ─────────────────────────────────────────
    check(
        'exec_return_code',
        `declare @ret int; exec @ret = dbo.GetOrder @OrderId = 1; select @ret`,
        ['@ret', 'int', 'exec', '@ret', '=', 'dbo.getorder', '@orderid']
    ),

    // ── DML trigger (INSERT/UPDATE/DELETE) ────────────────────────────────────
    check(
        'trigger_insert_update',
        `create trigger trgOrdersAudit on dbo.Orders after insert, update as begin insert into dbo.Audit (OrderId, ChangedAt) select OrderId, getdate() from inserted end`,
        ['create', 'trigger', 'trgordersaudit', 'on', 'dbo.orders', 'after', 'insert', 'update', 'as', 'begin', 'inserted', 'dbo.audit']
    ),
    check(
        'trigger_instead_of',
        `create trigger trgVwOrders on dbo.vwActiveOrders instead of insert as begin insert into dbo.Orders select * from inserted end`,
        ['create', 'trigger', 'instead', 'of', 'insert', 'dbo.vwactiveorders', 'dbo.orders', 'inserted']
    ),
    check(
        'trigger_not_for_replication',
        `create trigger trgAudit on dbo.Orders after insert not for replication as begin end`,
        ['not', 'for', 'replication']
    ),

    // ── WITHIN GROUP (aggregate functions) ────────────────────────────────────
    check(
        'percentile_cont',
        `select percentile_cont(0.5) within group (order by Amount) from dbo.Orders`,
        ['percentile_cont', '0.5', 'within', 'group', 'order by', 'amount']
    ),
    check(
        'percentile_disc',
        `select percentile_disc(0.9) within group (order by Score) over (partition by Category) from dbo.Results`,
        ['percentile_disc', '0.9', 'within', 'group', 'order by', 'score', 'over', 'partition', 'by', 'category']
    ),

    // ── Window frame (ROWS/RANGE BETWEEN) ────────────────────────────────────
    check(
        'window_rows_between',
        `select sum(Amount) over (partition by CustomerId order by OrderDate rows between unbounded preceding and current row) from dbo.Orders`,
        ['rows', 'between', 'unbounded', 'preceding', 'and', 'current', 'row']
    ),
    check(
        'window_range_between',
        `select avg(Amount) over (order by OrderDate range between interval '1' day preceding and current row) from dbo.Orders`,
        ['range', 'between', 'preceding', 'current', 'row']
    ),

    // ── TRY/CATCH details ─────────────────────────────────────────────────────
    check(
        'try_catch_error_functions',
        `begin try insert into dbo.T values (1) end try begin catch declare @msg nvarchar(4000); set @msg = error_message(); print @msg; if @@trancount > 0 rollback end catch`,
        ['begin', 'try', 'end', 'try', 'begin', 'catch', 'error_message', 'rollback', 'end', 'catch']
    ),
    check(
        'error_functions',
        `select error_number(), error_severity(), error_state(), error_procedure(), error_line(), error_message()`,
        ['error_number', 'error_severity', 'error_state', 'error_procedure', 'error_line', 'error_message']
    ),

    // ── RAISERROR with substitution params ────────────────────────────────────
    check(
        'raiserror_substitution',
        `raiserror ('Error: %s for ID %d', 16, 1, @msgParam, @idParam)`,
        ['raiserror', 'error:', '%s for id %d', '16', '1', '@msgparam', '@idparam']
    ),

    // ── FORMATMESSAGE ─────────────────────────────────────────────────────────
    check(
        'formatmessage_literal',
        `declare @msg nvarchar(1000); set @msg = formatmessage('Order %d not found for customer %s', @orderId, @custName)`,
        ['formatmessage', 'order %d not found', '@orderid', '@custname']
    ),
    check(
        'formatmessage_msgnum',
        `declare @msg nvarchar(1000); set @msg = formatmessage(50001, @orderId)`,
        ['formatmessage', '50001', '@orderid']
    ),

    // ── APPLY with VALUES ─────────────────────────────────────────────────────
    check(
        'apply_values',
        `select o.OrderId, v.Multiplier from dbo.Orders o cross apply (values (1), (2), (3)) v(Multiplier)`,
        ['cross', 'apply', 'values', '1', '2', '3', 'multiplier']
    ),

    // ── Multiple CTEs ─────────────────────────────────────────────────────────
    check(
        'multiple_ctes',
        `with Active as (select * from dbo.Orders where Status = 'Active'), Recent as (select * from Active where OrderDate > '2024-01-01') select count(*) from Recent`,
        ['with', 'active', 'as', 'recent', 'as', 'select', 'count']
    ),

    // ── OVER without PARTITION ────────────────────────────────────────────────
    check(
        'over_no_partition',
        `select sum(Amount) over () as GrandTotal from dbo.Orders`,
        ['sum(amount)', 'over', 'grandtotal']
    ),
    check(
        'cume_dist',
        `select cume_dist() over (order by Score) from dbo.Results`,
        ['cume_dist', 'over', 'order by', 'score']
    ),
    check(
        'ntile',
        `select ntile(4) over (order by Amount desc) as Quartile from dbo.Orders`,
        ['ntile', '4', 'over', 'order by', 'amount', 'desc', 'quartile']
    ),
    check(
        'percent_rank',
        `select percent_rank() over (partition by Dept order by Salary desc) from dbo.Employees`,
        ['percent_rank', 'over', 'partition', 'by', 'dept', 'order by', 'salary']
    ),

    // ── CREATE LOGIN / ALTER LOGIN ─────────────────────────────────────────────
    check(
        'create_login_sql',
        `create login AppUser with password = 'P@ssword123', default_database = MyDb, check_policy = on`,
        ['create', 'login', 'appuser', 'with', 'password', 'p@ssword123', 'default_database', 'mydb', 'check_policy']
    ),
    check(
        'alter_login',
        `alter login AppUser with password = 'NewP@ss', name = AppUser2`,
        ['alter', 'login', 'appuser', 'with', 'password', 'newp@ss']
    ),
    check(
        'create_user_from_login',
        `create user AppUser for login AppUser with default_schema = dbo`,
        ['create', 'user', 'appuser', 'for', 'login', 'default_schema', 'dbo']
    ),
    check(
        'create_user_without_login',
        `create user GuestUser without login`,
        ['create', 'user', 'guestuser', 'without', 'login']
    ),

    // ── ADD/REMOVE SIGNATURE ──────────────────────────────────────────────────
    check(
        'sp_addrolemember',
        `exec sp_addrolemember 'db_datareader', 'AppUser'`,
        ['sp_addrolemember', 'db_datareader', 'appuser']
    ),

    // ── NULLIF / COALESCE / CASE ──────────────────────────────────────────────
    check(
        'nullif',
        `select nullif(Status, '') from dbo.Orders`,
        ['nullif', 'status']
    ),
    check(
        'coalesce_multiarg',
        `select coalesce(Notes, Description, 'N/A') from dbo.Orders`,
        ['coalesce', 'notes', 'description', 'n/a']
    ),
    check(
        'case_searched',
        `select case when Amount > 1000 then 'Premium' when Amount > 500 then 'Standard' else 'Basic' end as Tier from dbo.Orders`,
        ['case', 'when', 'amount', '1000', 'premium', '500', 'standard', 'basic', 'tier']
    ),
    check(
        'case_simple',
        `select case Status when 'A' then 'Active' when 'I' then 'Inactive' else 'Unknown' end from dbo.Orders`,
        ['case', 'status', 'when', 'active', 'inactive', 'unknown']
    ),

    // ── SUBSTRING / CHARINDEX / STUFF ─────────────────────────────────────────
    check(
        'stuff',
        `select stuff(PhoneNumber, 4, 3, '***') from dbo.Customers`,
        ['stuff', 'phonenumber', '4', '3', '***']
    ),
    check(
        'charindex',
        `select charindex('@', Email, 1) from dbo.Customers`,
        ['charindex', '@', 'email', '1']
    ),

    // ── OBJECT_ID / OBJECT_NAME ───────────────────────────────────────────────
    check(
        'object_id_check',
        `if object_id('dbo.Orders', 'U') is not null drop table dbo.Orders`,
        ['object_id', 'dbo.orders', 'drop', 'table']
    ),

    // ── SCOPE_IDENTITY / @@IDENTITY ───────────────────────────────────────────
    check(
        'scope_identity',
        `select scope_identity()`,
        ['scope_identity']
    ),
    check(
        'at_identity',
        `select @@identity`,
        ['@@identity']
    ),

    // ── @@ROWCOUNT / @@ERROR ──────────────────────────────────────────────────
    check(
        'rowcount_check',
        `if @@rowcount = 0 raiserror ('No rows affected', 16, 1)`,
        ['@@rowcount', '0', 'raiserror', 'no rows affected']
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

console.log(`\nProbe 27 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
