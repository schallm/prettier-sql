/**
 * Probe 54 — Complex CTEs, multi-statement patterns, and output validation:
 *   - Multiple CTEs in one WITH clause (chained)
 *   - Recursive CTE with both anchor and recursive members having multiple columns
 *   - CTE with UNION ALL and 3 branches
 *   - SELECT from VALUES row constructor (table value constructor)
 *   - INSERT with VALUES row constructor (multiple rows)
 *   - MERGE with OUTPUT INTO
 *   - MERGE with multiple WHEN MATCHED conditions (different predicates)
 *   - DELETE from multiple CTEs
 *   - Complex IF with nested TRY/CATCH
 *   - Deeply nested subqueries (3 levels)
 *   - APPLY with row-by-row aggregation
 *   - CROSS APPLY with JSON functions
 *   - WHILE reading from cursor
 *   - Cursor FETCH INTO multiple variables
 *   - CASE with IS NULL / IS NOT NULL
 *   - Computed expression with multiple casts
 *   - CONVERT with binary target
 *   - CAST between numeric types
 *   - Aggregate function in HAVING without GROUP BY cols in SELECT
 *   - SELECT with GROUP BY and HAVING and ORDER BY
 *   - Multiple JOINs (4+ tables)
 *   - LEFT JOIN with IS NULL (anti-join pattern)
 *   - Multiple OR in WHERE across joined tables
 *   - Complex UPDATE FROM with multiple joins
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
    // ── Multiple CTEs chained ──────────────────────────────────────────────────
    check(
        'multiple_ctes',
        `with Active as (select * from dbo.Orders where Status = 'Active'), HighValue as (select * from Active where Amount > 1000), Summary as (select CustomerId, count(*) as Cnt, sum(Amount) as Total from HighValue group by CustomerId) select * from Summary where Cnt > 5 order by Total desc`,
        ['with active as', 'highvalue as', 'summary as', 'status', "'active'", 'amount > 1000', 'count', 'sum', 'group by', 'where cnt > 5', 'order by total']
    ),

    // ── INSERT multiple rows ───────────────────────────────────────────────────
    check(
        'insert_multi_rows',
        `insert into dbo.Status (Code, Label, IsActive) values ('A', 'Active', 1), ('P', 'Pending', 1), ('C', 'Closed', 0), ('D', 'Deleted', 0)`,
        ['insert into', 'dbo.status', 'code', 'label', 'isactive', "'a'", "'active'", "'p'", "'pending'", "'c'", "'closed'"]
    ),

    // ── VALUES as table constructor in FROM ────────────────────────────────────
    check(
        'values_table_constructor',
        `select v.Code, v.Label from (values ('A', 'Active'), ('P', 'Pending'), ('C', 'Closed')) v(Code, Label) order by v.Code`,
        ['values', "'a'", "'active'", "'p'", "'pending'", 'v(code, label)', 'order by']
    ),

    // ── MERGE with multiple WHEN MATCHED conditions ────────────────────────────
    check(
        'merge_multi_when',
        `merge dbo.Target t using dbo.Source s on t.Id = s.Id when matched and s.IsDeleted = 1 then delete when matched and s.Amount <> t.Amount then update set t.Amount = s.Amount, t.UpdatedAt = getdate() when not matched by target then insert (Id, Amount) values (s.Id, s.Amount);`,
        ['when matched and s.isdeleted', 'then delete', 'when matched and s.amount', 'then update set', 'updatedAt = getdate', 'when not matched by target', 'then insert']
    ),

    // ── Anti-join pattern (LEFT JOIN IS NULL) ─────────────────────────────────
    check(
        'anti_join',
        `select c.Id, c.Name from dbo.Customers c left join dbo.Orders o on c.Id = o.CustomerId where o.OrderId is null`,
        ['left join', 'on c.id = o.customerid', 'where o.orderid is null']
    ),

    // ── 4-table join ──────────────────────────────────────────────────────────
    check(
        'four_table_join',
        `select o.OrderId, c.Name as Customer, p.Name as Product, s.Name as Shipper from dbo.Orders o inner join dbo.Customers c on o.CustomerId = c.Id inner join dbo.OrderLines l on o.OrderId = l.OrderId inner join dbo.Products p on l.ProductId = p.Id left join dbo.Shippers s on o.ShipperId = s.Id`,
        ['inner join dbo.customers', 'inner join dbo.orderlines', 'inner join dbo.products', 'left join dbo.shippers']
    ),

    // ── Deeply nested subquery ────────────────────────────────────────────────
    check(
        'deep_subquery',
        `select * from dbo.Orders where CustomerId in (select Id from dbo.Customers where RegionId in (select Id from dbo.Regions where Country = 'US'))`,
        ['customerid in', 'select id from dbo.customers', 'regionid in', 'select id from dbo.regions', "country = 'us'"]
    ),

    // ── GROUP BY + HAVING + ORDER BY ──────────────────────────────────────────
    check(
        'group_having_order',
        `select CustomerId, count(*) as OrderCount, sum(Amount) as Total, avg(Amount) as AvgAmt from dbo.Orders where OrderDate >= '2024-01-01' group by CustomerId having count(*) > 5 and sum(Amount) > 10000 order by Total desc, OrderCount desc`,
        ['group by customerid', 'having count(*) > 5', 'and sum(amount) > 10000', 'order by total desc, ordercount desc']
    ),

    // ── CASE with IS NULL ─────────────────────────────────────────────────────
    check(
        'case_is_null',
        `select case when Phone is null then 'No Phone' when Email is null then 'No Email' else 'Complete' end as ContactStatus from dbo.Customers`,
        ['case', 'phone is null', "'no phone'", 'email is null', "'no email'", "'complete'", 'contactstatus']
    ),

    // ── Cursor FETCH multiple vars ────────────────────────────────────────────
    check(
        'cursor_fetch_multi',
        `declare @id int, @name nvarchar(100), @amt decimal(18,2); declare cur cursor for select OrderId, CustomerName, Amount from dbo.Orders; open cur; fetch next from cur into @id, @name, @amt; while @@fetch_status = 0 begin print @name; fetch next from cur into @id, @name, @amt end; close cur; deallocate cur`,
        ['declare @id', '@name', '@amt', 'cursor for select', 'fetch next from cur into @id, @name, @amt', '@@fetch_status', 'close cur', 'deallocate cur']
    ),

    // ── Complex UPDATE with multiple joins ────────────────────────────────────
    check(
        'update_multi_join',
        `update p set p.TotalOrders = subq.OrderCount, p.TotalRevenue = subq.Revenue from dbo.CustomerProfile p inner join (select CustomerId, count(*) as OrderCount, sum(Amount) as Revenue from dbo.Orders where Status = 'Completed' group by CustomerId) subq on p.CustomerId = subq.CustomerId`,
        ['update p', 'set p.totalorders', 'p.totalrevenue', 'from dbo.customerprofile', 'inner join', 'count(*)', 'sum(amount)', 'group by customerid']
    ),

    // ── Complex CAST / CONVERT chain ──────────────────────────────────────────
    check(
        'cast_convert_chain',
        `select cast(convert(varchar(20), OrderDate, 112) as int) as DateInt, convert(decimal(18,4), cast(Amount as float) * 1.1) as AmountWithTax from dbo.Orders`,
        ['cast', 'convert', 'varchar', '112', 'decimal', 'float', '1.1', 'dateint', 'amountwithtax']
    ),

    // ── APPLY with aggregation ────────────────────────────────────────────────
    check(
        'apply_aggregation',
        `select c.Id, c.Name, stats.OrderCount, stats.TotalAmount from dbo.Customers c outer apply (select count(*) as OrderCount, sum(Amount) as TotalAmount from dbo.Orders where CustomerId = c.Id) stats`,
        ['outer apply', 'count(*)', 'sum(amount)', 'totalamount', 'ordercount']
    ),

    // ── CROSS APPLY OPENJSON ──────────────────────────────────────────────────
    check(
        'cross_apply_openjson_typed',
        `select o.OrderId, j.ProductId, j.Qty, j.Price from dbo.Orders o cross apply openjson(o.ItemsJson) with (ProductId int, Qty int, Price decimal(10,2)) j where j.Qty > 0`,
        ['cross apply', 'openjson', 'itemsjson', 'productid', 'qty', 'price decimal', 'j.qty > 0']
    ),

    // ── MERGE OUTPUT INTO ─────────────────────────────────────────────────────
    check(
        'merge_output_into',
        `merge dbo.Customers t using @source s on t.Id = s.Id when matched then update set t.Name = s.Name when not matched by target then insert (Id, Name) values (s.Id, s.Name) output $action as MergeAction, inserted.Id, deleted.Name into @changes (MergeAction, Id, OldName);`,
        ['output $action', 'mergeaction', 'inserted.id', 'deleted.name', 'into @changes']
    ),

    // ── DELETE from CTE targeting ─────────────────────────────────────────────
    check(
        'delete_via_cte_join',
        `with Dupes as (select Id, row_number() over (partition by Email order by Id) as Rn from dbo.Customers) delete from Dupes where Rn > 1`,
        ['with dupes', 'row_number', 'partition by email', 'delete from dupes', 'where rn > 1']
    ),

    // ── CTE UNION ALL three branches ──────────────────────────────────────────
    check(
        'cte_union_all_three',
        `with Combined as (select 'Orders' as Src, OrderId as Id, Amount from dbo.Orders union all select 'Invoices', InvoiceId, Amount from dbo.Invoices union all select 'Credits', CreditId, -Amount from dbo.Credits) select Src, sum(Amount) from Combined group by Src`,
        ['with combined', 'union all', "'orders'", "'invoices'", "'credits'", 'sum(amount)', 'group by src']
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

console.log(`\nProbe 54 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
