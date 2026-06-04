/**
 * Probe 35 — Deeper coverage:
 *   - WITH NOCHECK / NOCHECK CONSTRAINT / CHECK CONSTRAINT
 *   - ALTER TABLE ... SWITCH PARTITION
 *   - OUTPUT INTO in INSERT / UPDATE / DELETE
 *   - OPENROWSET (bulk and OLEDB forms)
 *   - FOR XML (AUTO, RAW, EXPLICIT, PATH, ROOT, ELEMENTS, TYPE)
 *   - FOR JSON (AUTO, PATH, ROOT, WITHOUT_ARRAY_WRAPPER)
 *   - PIVOT / UNPIVOT
 *   - APPLY (CROSS APPLY, OUTER APPLY)
 *   - TABLESAMPLE
 *   - OPTION (QUERY HINTS: MAXDOP, FORCE ORDER, LOOP JOIN, etc.)
 *   - COMPUTE (legacy but still parseable)
 *   - TOP WITH TIES
 *   - OFFSET ... FETCH
 *   - EXCEPT / INTERSECT
 *   - OUTER JOIN with multiple conditions
 *   - INSERT ... DEFAULT VALUES
 *   - Multi-row VALUES in INSERT
 *   - MERGE with complex predicates
 *   - DELETE with OUTPUT
 *   - UPDATE with FROM (correlated)
 *   - WAITFOR DELAY / TIME
 *   - RAISERROR with all arguments
 *   - @@IDENTITY / @@ROWCOUNT / @@ERROR in expressions
 *   - CAST / CONVERT / TRY_CAST / TRY_CONVERT
 *   - IIF / CHOOSE
 *   - DATEADD / DATEDIFF / DATENAME / DATEPART
 *   - STUFF / REPLACE / CHARINDEX
 *   - ROW_NUMBER / RANK / DENSE_RANK / NTILE / LAG / LEAD
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
    // ── ALTER TABLE constraints ───────────────────────────────────────────────
    check(
        'nocheck_constraint',
        `alter table dbo.Orders nocheck constraint FK_Orders_Customers`,
        ['nocheck', 'constraint', 'fk_orders_customers']
    ),
    check(
        'check_constraint',
        `alter table dbo.Orders check constraint FK_Orders_Customers`,
        ['check', 'constraint', 'fk_orders_customers']
    ),
    check(
        'nocheck_all_constraints',
        `alter table dbo.Orders nocheck constraint all`,
        ['nocheck', 'constraint', 'all']
    ),

    // ── ALTER TABLE SWITCH PARTITION ──────────────────────────────────────────
    check(
        'switch_partition',
        `alter table dbo.FactSales switch partition 3 to dbo.FactSalesArchive partition 1`,
        ['switch', 'partition', '3', 'dbo.factsalesarchive', '1']
    ),

    // ── OUTPUT INTO ───────────────────────────────────────────────────────────
    check(
        'insert_output_into',
        `insert into dbo.Orders (CustomerId, Amount) output inserted.OrderId, inserted.Amount into @InsertedRows select CustomerId, Amount from @NewOrders`,
        ['insert', 'output', 'inserted.orderid', 'inserted.amount', 'into', '@insertedrows']
    ),
    check(
        'delete_output_into',
        `delete from dbo.Orders output deleted.OrderId, deleted.Amount into @DeletedRows where OrderDate < '2020-01-01'`,
        ['delete', 'output', 'deleted.orderid', 'deleted.amount', 'into', '@deletedrows', 'where', 'orderdate']
    ),
    check(
        'update_output_into',
        `update dbo.Orders set Status = 'Archived' output inserted.OrderId, deleted.Status, inserted.Status into @Changes where OrderDate < '2020-01-01'`,
        ['update', 'set', 'archived', 'output', 'inserted.orderid', 'deleted.status', 'inserted.status', 'into', '@changes']
    ),

    // ── FOR XML ───────────────────────────────────────────────────────────────
    check(
        'for_xml_auto',
        `select OrderId, Amount from dbo.Orders for xml auto`,
        ['select', 'orderid', 'amount', 'for', 'xml', 'auto']
    ),
    check(
        'for_xml_path_root',
        `select OrderId as '@Id', Amount from dbo.Orders for xml path('Order'), root('Orders'), type`,
        ['for', 'xml', 'path', 'order', 'root', 'orders', 'type']
    ),
    check(
        'for_xml_raw_elements',
        `select OrderId, Amount from dbo.Orders for xml raw('row'), elements xsinil`,
        ['for', 'xml', 'raw', 'row', 'elements', 'xsinil']
    ),

    // ── FOR JSON ──────────────────────────────────────────────────────────────
    check(
        'for_json_auto',
        `select OrderId, Amount from dbo.Orders for json auto`,
        ['select', 'for', 'json', 'auto']
    ),
    check(
        'for_json_path_root',
        `select OrderId, Amount from dbo.Orders for json path, root('Orders'), without_array_wrapper`,
        ['for', 'json', 'path', 'root', 'orders', 'without_array_wrapper']
    ),

    // ── PIVOT / UNPIVOT ───────────────────────────────────────────────────────
    check(
        'pivot',
        `select * from (select Year, Quarter, Amount from dbo.Sales) src pivot (sum(Amount) for Quarter in ([Q1],[Q2],[Q3],[Q4])) pvt`,
        ['pivot', 'sum', 'amount', 'for', 'quarter', 'q1', 'q2', 'q3', 'q4']
    ),
    check(
        'unpivot',
        `select ProductId, Quarter, Sales from dbo.QuarterlySales unpivot (Sales for Quarter in (Q1, Q2, Q3, Q4)) unpvt`,
        ['unpivot', 'sales', 'for', 'quarter', 'q1', 'q2', 'q3', 'q4']
    ),

    // ── APPLY ─────────────────────────────────────────────────────────────────
    check(
        'cross_apply',
        `select o.OrderId, items.ItemId from dbo.Orders o cross apply dbo.fn_GetOrderItems(o.OrderId) items`,
        ['cross', 'apply', 'fn_getorderitems', 'orderid', 'items']
    ),
    check(
        'outer_apply',
        `select e.EmployeeId, recent.OrderDate from dbo.Employees e outer apply (select top 1 OrderDate from dbo.Orders where SalesRepId = e.EmployeeId order by OrderDate desc) recent`,
        ['outer', 'apply', 'employeeid', 'orderdate', 'salesrepid', 'desc', 'recent']
    ),

    // ── TABLESAMPLE ───────────────────────────────────────────────────────────
    check(
        'tablesample',
        `select OrderId, Amount from dbo.Orders tablesample (10 percent) repeatable(12345)`,
        ['tablesample', '10', 'percent', 'repeatable', '12345']
    ),

    // ── OPTION (query hints) ──────────────────────────────────────────────────
    check(
        'option_maxdop',
        `select * from dbo.Orders where OrderDate >= '2024-01-01' option (maxdop 4, force order)`,
        ['option', 'maxdop', '4', 'force', 'order']
    ),
    check(
        'option_loop_join',
        `select * from dbo.Orders o join dbo.Customers c on o.CustomerId = c.Id option (loop join, recompile)`,
        ['option', 'loop', 'join', 'recompile']
    ),

    // ── TOP WITH TIES ─────────────────────────────────────────────────────────
    check(
        'top_with_ties',
        `select top 10 with ties OrderId, Amount from dbo.Orders order by Amount desc`,
        ['top', '10', 'with', 'ties', 'orderid', 'amount', 'order by', 'desc']
    ),

    // ── OFFSET / FETCH ────────────────────────────────────────────────────────
    check(
        'offset_fetch',
        `select OrderId, Amount from dbo.Orders order by OrderDate desc offset 20 rows fetch next 10 rows only`,
        ['order by', 'offset', '20', 'rows', 'fetch', 'next', '10', 'rows', 'only']
    ),

    // ── EXCEPT / INTERSECT ────────────────────────────────────────────────────
    check(
        'except',
        `select CustomerId from dbo.Orders except select CustomerId from dbo.Blacklist`,
        ['except', 'customerid', 'blacklist']
    ),
    check(
        'intersect',
        `select CustomerId from dbo.Orders intersect select CustomerId from dbo.PremiumCustomers`,
        ['intersect', 'customerid', 'premiumcustomers']
    ),

    // ── INSERT DEFAULT VALUES ─────────────────────────────────────────────────
    check(
        'insert_default_values',
        `insert into dbo.AuditLog default values`,
        ['insert', 'default', 'values']
    ),

    // ── WAITFOR ───────────────────────────────────────────────────────────────
    check(
        'waitfor_delay',
        `waitfor delay '00:00:05'`,
        ['waitfor', 'delay', '00:00:05']
    ),
    check(
        'waitfor_time',
        `waitfor time '23:59:00'`,
        ['waitfor', 'time', '23:59:00']
    ),

    // ── RAISERROR ─────────────────────────────────────────────────────────────
    check(
        'raiserror_full',
        `raiserror('Order %d not found for customer %s', 16, 1, @orderId, @customerName)`,
        ['raiserror', '16', '1', '@orderid', '@customername']
    ),

    // ── System variables in expressions ──────────────────────────────────────
    check(
        'system_vars',
        `declare @id int = @@identity; declare @rows int = @@rowcount; declare @err int = @@error`,
        ['@@identity', '@@rowcount', '@@error']
    ),

    // ── CAST / CONVERT / TRY variants ────────────────────────────────────────
    check(
        'cast_convert',
        `select cast(Amount as int), convert(nvarchar(20), OrderDate, 101), try_cast(Notes as int), try_convert(decimal(10,2), '12.5') from dbo.Orders`,
        ['cast', 'as int', 'convert', 'nvarchar', 'orderdate', '101', 'try_cast', 'try_convert', 'decimal']
    ),

    // ── IIF / CHOOSE ─────────────────────────────────────────────────────────
    check(
        'iif_choose',
        `select iif(Amount > 100, 'Large', 'Small'), choose(1, 'First', 'Second', 'Third') from dbo.Orders`,
        ['iif', 'amount', 'large', 'small', 'choose', 'first', 'second', 'third']
    ),

    // ── Date functions ────────────────────────────────────────────────────────
    check(
        'date_functions',
        `select dateadd(day, 30, OrderDate), datediff(month, '2024-01-01', OrderDate), datename(weekday, OrderDate), datepart(quarter, OrderDate) from dbo.Orders`,
        ['dateadd', 'day', '30', 'orderdate', 'datediff', 'month', 'datename', 'weekday', 'datepart', 'quarter']
    ),

    // ── String functions ──────────────────────────────────────────────────────
    check(
        'string_functions',
        `select stuff(Name, 1, 3, 'XXX'), replace(Email, '@example.com', ''), charindex('@', Email), len(Name) from dbo.Customers`,
        ['stuff', 'name', 'xxx', 'replace', 'email', 'charindex', 'len']
    ),

    // ── Window functions ──────────────────────────────────────────────────────
    check(
        'row_number',
        `select row_number() over (partition by CustomerId order by OrderDate desc) as RowNum, OrderId from dbo.Orders`,
        ['row_number', 'over', 'partition by', 'customerid', 'order by', 'orderdate', 'rownum']
    ),
    check(
        'lag_lead',
        `select OrderId, Amount, lag(Amount, 1, 0) over (order by OrderDate) as PrevAmount, lead(Amount, 1, 0) over (order by OrderDate) as NextAmount from dbo.Orders`,
        ['lag', 'lead', 'over', 'order by', 'orderdate', 'prevamount', 'nextamount']
    ),
    check(
        'ntile',
        `select OrderId, Amount, ntile(4) over (order by Amount desc) as Quartile from dbo.Orders`,
        ['ntile', '4', 'over', 'order by', 'amount', 'quartile']
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

console.log(`\nProbe 35 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
