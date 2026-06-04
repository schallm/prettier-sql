/**
 * Probe 57 — Procedural edge cases: GOTO, nested TRY/CATCH,
 *   SAVE TRANSACTION, compound assignment operators,
 *   WHILE with complex body, IF without BEGIN/END,
 *   ELSE IF chain, RETURN with value from scalar function,
 *   EXEC captured result @@ROWCOUNT after DML,
 *   RAISERROR with all severity levels,
 *   THROW with variable,
 *   Semicolon injection attack surface (should not affect),
 *   Multiple DECLARE statements,
 *   DECLARE TABLE with constraints,
 *   Nested SELECT inside PRINT via CAST,
 *   Parameterized EXEC with mixed positional and named args,
 *   Complex compound transaction with SAVE TRANSACTION,
 *   CREATE PROCEDURE with all parameter options,
 *   ALTER PROCEDURE (recompile/encryption)
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
    // ── SAVE TRANSACTION ──────────────────────────────────────────────────────
    check(
        'save_transaction',
        `begin transaction; save transaction SavePoint1; begin try insert into dbo.Orders (Amount) values (100) end try begin catch rollback transaction SavePoint1 end catch commit transaction`,
        ['save transaction', 'savepoint1', 'begin try', 'begin catch', 'rollback transaction savepoint1', 'commit transaction']
    ),

    // ── ELSE IF chain ─────────────────────────────────────────────────────────
    check(
        'else_if_chain',
        `if @score >= 90 set @grade = 'A' else if @score >= 80 set @grade = 'B' else if @score >= 70 set @grade = 'C' else if @score >= 60 set @grade = 'D' else set @grade = 'F'`,
        ["@score >= 90", "'a'", "else if @score >= 80", "'b'", "else if @score >= 70", "'c'", "else if @score >= 60", "'d'", "'f'"]
    ),

    // ── RAISERROR severity levels ─────────────────────────────────────────────
    check(
        'raiserror_severity_25',
        `raiserror ('Fatal error occurred', 25, 1) with log`,
        ['raiserror', 'fatal error occurred', '25', '1', 'with log']
    ),
    check(
        'raiserror_severity_10',
        `raiserror ('Informational message', 10, 1)`,
        ['raiserror', 'informational message', '10', '1']
    ),
    check(
        'raiserror_variable',
        `declare @msg nvarchar(2048) = 'Error: ' + @errorDetail; raiserror (@msg, 16, 1)`,
        ['raiserror', '@msg', '16', '1']
    ),

    // ── THROW with variable ───────────────────────────────────────────────────
    check(
        'throw_variable',
        `declare @errNum int = 50001; declare @errMsg nvarchar(2048) = 'Failed'; throw @errNum, @errMsg, 1`,
        ['throw', '@errnum', '@errmsg', '1']
    ),

    // ── Compound assignment operators ─────────────────────────────────────────
    check(
        'compound_assign_all',
        `declare @v int = 100; set @v += 10; set @v -= 5; set @v *= 2; set @v /= 3; set @v %= 7`,
        ['+=', '-=', '*=', '/=', '%=']
    ),

    // ── DECLARE TABLE with constraints ────────────────────────────────────────
    check(
        'declare_table_constraints',
        `declare @t table (Id int not null primary key, Name nvarchar(100) not null unique, Amount decimal(18,2) check (Amount >= 0))`,
        ['declare @t table', 'primary key', 'not null unique', 'check (amount >= 0)']
    ),

    // ── CREATE PROCEDURE with all param options ────────────────────────────────
    check(
        'proc_all_params',
        `create procedure dbo.UpdateOrder @OrderId int, @Status nvarchar(20) = 'Pending', @Amount decimal(18,2) output, @Notes nvarchar(max) = null, @Notify bit = 0 readonly as begin select @Amount = Amount from dbo.Orders where OrderId = @OrderId end`,
        ['create procedure', '@orderid int', "@status nvarchar(20) = 'pending'", '@amount decimal', 'output', '@notes nvarchar(max) = null', '@notify bit = 0', 'readonly']
    ),

    // ── ALTER PROCEDURE ───────────────────────────────────────────────────────
    check(
        'alter_procedure',
        `alter procedure dbo.GetOrders @CustomerId int with recompile, encryption as begin select * from dbo.Orders where CustomerId = @CustomerId end`,
        ['alter procedure', 'getorders', '@customerid', 'with recompile', 'encryption', 'select *', 'from dbo.orders']
    ),

    // ── IF without BEGIN/END (single stmt body) ────────────────────────────────
    check(
        'if_no_begin',
        `if @x > 0 print 'positive' else print 'non-positive'`,
        ['if @x > 0', 'print', "'positive'", 'else', "'non-positive'"]
    ),

    // ── WHILE with complex body ────────────────────────────────────────────────
    check(
        'while_complex',
        `declare @i int = 1, @sum int = 0; while @i <= 100 begin if @i % 2 = 0 begin set @sum += @i end set @i += 1 end; print @sum`,
        ['while @i <= 100', 'begin', 'if @i % 2 = 0', '@sum += @i', '@i += 1', 'end', 'print @sum']
    ),

    // ── @@ROWCOUNT after DML ──────────────────────────────────────────────────
    check(
        'rowcount_after_dml',
        `update dbo.Orders set Status = 'Archived' where OrderDate < dateadd(year, -3, getdate()); declare @affected int = @@rowcount; if @affected > 0 print cast(@affected as nvarchar) + ' rows archived'`,
        ['update', 'set status', '@@rowcount', '@affected', 'if @affected > 0', 'print cast']
    ),

    // ── PRINT with expression ─────────────────────────────────────────────────
    check(
        'print_expression',
        `print 'Total: ' + cast(@@rowcount as nvarchar(10)) + ' rows affected'`,
        ['print', "'total: '", '@@rowcount', "'rows affected'"]
    ),

    // ── EXEC positional and named mixed ───────────────────────────────────────
    check(
        'exec_positional',
        `exec dbo.GetOrders 42, 'Active', 100`,
        ['exec', 'getorders', '42', "'active'", '100']
    ),

    // ── Multiple DECLARE one-liner ────────────────────────────────────────────
    check(
        'declare_one_liner',
        `declare @a int, @b varchar(50), @c datetime2, @d decimal(18,2), @e bit`,
        ['declare @a int', '@b varchar', '@c datetime2', '@d decimal', '@e bit']
    ),

    // ── CREATE PROCEDURE or ALTER ─────────────────────────────────────────────
    check(
        'create_or_alter_procedure',
        `create or alter procedure dbo.GetActiveSummary @StartDate date, @EndDate date as begin select count(*) as OrderCount, sum(Amount) as TotalAmount from dbo.Orders where OrderDate between @StartDate and @EndDate and Status = 'Active' end`,
        ['create or alter procedure', 'getactivesummary', '@startdate date', '@enddate date', 'between @startdate and @enddate', "'active'"]
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

console.log(`\nProbe 57 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
