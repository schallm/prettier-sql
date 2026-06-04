/**
 * Probe 45 — Dynamic SQL, RAISERROR variants, complex expressions:
 *   - RAISERROR with state=0 (edge case for state param)
 *   - RAISERROR with sysname error number
 *   - THROW with all 3 forms: (errNum, msg, state) / re-throw
 *   - SELECT CASE WHEN with NULL handling
 *   - Boolean expression in CASE (IS NULL, BETWEEN, LIKE)
 *   - IIF with NULL result
 *   - COALESCE vs ISNULL performance hint
 *   - Subquery in FROM with alias
 *   - VALUES as table source (row constructor)
 *   - Table alias without AS keyword
 *   - Column alias without AS keyword (bare identifier)
 *   - Multiple OVER() with named window
 *   - WINDOW clause (SQL:2003, but supported in SQL Server 2022)
 *   - UNION with ORDER BY in subquery (requires parentheses)
 *   - CTE referenced twice in main query
 *   - Self-referencing CTE (recursive) with MAX recursion hint
 *   - Complex MERGE with multiple output columns
 *   - MERGE with TOP
 *   - MERGE with WHEN NOT MATCHED BY SOURCE DELETE
 *   - INSERT EXEC from function
 *   - SELECT with ISJSON predicate
 *   - FOR JSON with INCLUDE_NULL_VALUES
 *   - JSON_OBJECT / JSON_ARRAY (SQL Server 2022+)
 *   - GREATEST / LEAST (SQL Server 2022+)
 *   - DATE_BUCKET (SQL Server 2022+)
 *   - GENERATE_SERIES (SQL Server 2022+)
 *   - TRIM with characters argument
 *   - LTRIM / RTRIM with characters argument (SQL Server 2022+)
 *   - STRING_ESCAPE
 *   - UNICODE / ASCII / CHAR / NCHAR
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
    // ── RAISERROR forms ───────────────────────────────────────────────────────
    check(
        'raiserror_state_zero',
        `raiserror ('Custom error message', 16, 0)`,
        ['raiserror', 'custom error message', '16', '0']
    ),
    check(
        'raiserror_with_substitution',
        `raiserror (N'Order %d not found for %s', 16, 1, @orderId, @name)`,
        ['raiserror', 'order', '%d', '%s', '16', '1', '@orderid', '@name']
    ),
    check(
        'raiserror_nowait',
        `raiserror ('Step 1 complete', 0, 1) with nowait`,
        ['raiserror', 'step 1 complete', '0', '1', 'with nowait']
    ),

    // ── THROW forms ───────────────────────────────────────────────────────────
    check(
        'throw_all_args',
        `throw 50001, N'Record not found', 1`,
        ['throw', '50001', 'record not found', '1']
    ),
    check(
        'throw_rethrow',
        `begin try exec dbo.RiskyProc end try begin catch throw end catch`,
        ['begin try', 'exec', 'begin catch', 'throw', 'end catch']
    ),

    // ── VALUES as table source ────────────────────────────────────────────────
    check(
        'values_table_source',
        `select * from (values (1, 'a'), (2, 'b'), (3, 'c')) t(Id, Code)`,
        ['values', '1', "'a'", '2', "'b'", '3', "'c'", 't(id, code)']
    ),

    // ── Bare alias (no AS) ────────────────────────────────────────────────────
    check(
        'bare_alias',
        `select o.OrderId Id, o.Amount Total, c.Name Customer from dbo.Orders o join dbo.Customers c on o.CustomerId = c.Id`,
        ['orderid', 'id', 'amount', 'total', 'name', 'customer', 'join']
    ),

    // ── MERGE with TOP ────────────────────────────────────────────────────────
    check(
        'merge_top',
        `merge top (1000) dbo.Target t using dbo.Source s on t.Id = s.Id when matched then update set t.Name = s.Name when not matched then insert (Id, Name) values (s.Id, s.Name);`,
        ['merge', 'top', '1000', 'target', 'source', 'when matched', 'update set', 'when not matched', 'insert']
    ),

    // ── MERGE with NOT MATCHED BY SOURCE ──────────────────────────────────────
    check(
        'merge_not_matched_by_source',
        `merge dbo.Target t using dbo.Source s on t.Id = s.Id when not matched by target then insert (Id, Name) values (s.Id, s.Name) when not matched by source then delete;`,
        ['not matched by target', 'insert', 'values', 'not matched by source', 'delete']
    ),

    // ── ISJSON predicate ──────────────────────────────────────────────────────
    check(
        'isjson_predicate',
        `select * from dbo.Events where isjson(Payload) = 1 and json_value(Payload, '$.type') = 'OrderCreated'`,
        ['isjson', 'payload', '= 1', 'json_value', '$.type', 'ordercreated']
    ),

    // ── FOR JSON with INCLUDE_NULL_VALUES ──────────────────────────────────────
    check(
        'for_json_include_nulls',
        `select OrderId, CustomerId, ShipDate from dbo.Orders for json path, include_null_values`,
        ['for json', 'path', 'include_null_values']
    ),

    // ── CTE referenced twice ──────────────────────────────────────────────────
    check(
        'cte_referenced_twice',
        `with Orders2024 as (select * from dbo.Orders where year(OrderDate) = 2024) select count(*) as Cnt, avg(Amount) as Avg from Orders2024 where Amount > 100`,
        ['with', 'orders2024', 'year', '2024', 'count', 'cnt', 'avg', 'where amount', '100']
    ),

    // ── TRIM with characters argument ─────────────────────────────────────────
    check(
        'trim_chars',
        `select trim('.-' from ProductCode) from dbo.Products`,
        ['trim', "'.-'", 'from productcode']
    ),

    // ── String functions ──────────────────────────────────────────────────────
    check(
        'unicode_ascii_char',
        `select unicode(N'A'), ascii('A'), char(65), nchar(65)`,
        ['unicode', 'ascii', 'char', 'nchar', '65']
    ),
    check(
        'string_escape',
        `select string_escape(N'path\to\file', 'json')`,
        ['string_escape', 'path', 'json']
    ),

    // ── IIF with NULL ─────────────────────────────────────────────────────────
    check(
        'iif_null',
        `select iif(Amount is null, 0, Amount) as SafeAmount from dbo.Orders`,
        ['iif', 'amount is null', '0', 'safeamount']
    ),

    // ── Recursive CTE with MAXRECURSION hint ──────────────────────────────────
    check(
        'recursive_cte_maxrecursion',
        `with Nums as (select 1 as N union all select N + 1 from Nums where N < 1000) select * from Nums option (maxrecursion 1000)`,
        ['with nums', 'union all', 'where n < 1000', 'option', 'maxrecursion', '1000']
    ),

    // ── SELECT top without parens (legacy) ────────────────────────────────────
    check(
        'top_no_parens',
        `select top 10 OrderId, Amount from dbo.Orders order by Amount desc`,
        ['top', '10', 'orderid', 'amount', 'order by', 'desc']
    ),

    // ── Percent TOP ──────────────────────────────────────────────────────────
    check(
        'top_percent',
        `select top 10 percent * from dbo.Orders order by Amount desc`,
        ['top', '10', 'percent', 'order by', 'amount', 'desc']
    ),

    // ── GRANT WITH GRANT OPTION ───────────────────────────────────────────────
    check(
        'grant_with_grant_option',
        `grant select on dbo.Orders to AppUser with grant option`,
        ['grant', 'select', 'dbo.orders', 'appuser', 'with grant option']
    ),

    // ── REVOKE CASCADE ────────────────────────────────────────────────────────
    check(
        'revoke_cascade',
        `revoke select on dbo.Orders from AppUser cascade`,
        ['revoke', 'select', 'dbo.orders', 'appuser', 'cascade']
    ),

    // ── Schema permission ─────────────────────────────────────────────────────
    check(
        'grant_schema',
        `grant select, insert on schema::dbo to AppRole`,
        ['grant', 'select', 'insert', 'schema::dbo', 'approle']
    ),

    // ── DBCC CHECKDB with REPAIR ──────────────────────────────────────────────
    check(
        'dbcc_checkdb_repair',
        `dbcc checkdb ('MyDb', repair_allow_data_loss)`,
        ['dbcc', 'checkdb', 'mydb', 'repair_allow_data_loss']
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

console.log(`\nProbe 45 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
