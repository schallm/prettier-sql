/**
 * Probe 41 — Distributed transactions, linked servers, and special statements:
 *   - BEGIN DISTRIBUTED TRANSACTION
 *   - EXEC ... AT linked_server (tested before, confirmed working)
 *   - sp_addlinkedserver / sp_addloginmapping
 *   - sp_configure with VALUE
 *   - sp_rename (table, column, index, type)
 *   - EXEC with named parameters in any order
 *   - EXEC with string variable (dynamic proc name)
 *   - EXECUTE AS CALLER / SELF / OWNER / 'user'
 *   - REVERT WITH COOKIE
 *   - OPEN / CLOSE MASTER KEY
 *   - OPEN / CLOSE SYMMETRIC KEY
 *   - CREATE / DROP CERTIFICATE
 *   - Encryption by password / certificate / asymmetric key
 *   - BACKUP CERTIFICATE
 *   - CREATE / DROP ASYMMETRIC KEY
 *   - CREATE / DROP SYMMETRIC KEY
 *   - GRANT ON CERTIFICATE / ON ASYMMETRIC KEY
 *   - SELECT with CROSS JOIN (multiple)
 *   - Multiple LEFT JOINs
 *   - Derived table in FROM
 *   - IN with literal list (large)
 *   - VALUES constructor (multiple rows)
 *   - EXCEPT ALL / INTERSECT ALL (note: T-SQL doesn't support these but good to probe)
 *   - Long column alias list
 *   - SELECT with many columns (50+) to stress test line wrapping
 *   - Long WHERE with many AND conditions
 *   - Nested subquery (3 levels deep)
 *   - Function with many parameters
 *   - COALESCE with 5 args
 *   - CASE with 10 WHEN branches
 *   - Complex GROUP BY with 5 columns
 *   - ORDER BY with multiple COLLATE
 *   - Multiple output parameters in EXEC
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
    // ── BEGIN DISTRIBUTED TRANSACTION ─────────────────────────────────────────
    check(
        'begin_distributed_transaction',
        `begin distributed transaction`,
        ['begin', 'distributed', 'transaction']
    ),

    // ── EXECUTE AS forms ──────────────────────────────────────────────────────
    check(
        'execute_as_caller',
        `execute as caller`,
        ['execute as', 'caller']
    ),
    check(
        'execute_as_self',
        `execute as self`,
        ['execute as', 'self']
    ),

    // ── Multi-row VALUES ──────────────────────────────────────────────────────
    check(
        'multi_row_values',
        `insert into dbo.Tags (Name, Color) values ('Bug', 'Red'), ('Feature', 'Green'), ('Doc', 'Blue'), ('Test', 'Yellow')`,
        ['values', 'bug', 'red', 'feature', 'green', 'doc', 'blue', 'test', 'yellow']
    ),

    // ── Derived table in FROM ─────────────────────────────────────────────────
    check(
        'derived_table',
        `select avg(OrderTotal) as AvgTotal from (select CustomerId, sum(Amount) as OrderTotal from dbo.Orders group by CustomerId) sub`,
        ['avg', 'avgtotal', 'sum', 'ordertotal', 'group by', 'customerid', 'sub']
    ),

    // ── IN with literal list ──────────────────────────────────────────────────
    check(
        'in_literal_list',
        `select * from dbo.Orders where Status in ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled')`,
        ['in', 'pending', 'processing', 'shipped', 'delivered', 'cancelled']
    ),

    // ── COALESCE with many args ───────────────────────────────────────────────
    check(
        'coalesce_many_args',
        `select coalesce(Phone, Mobile, WorkPhone, HomePhone, AlternatePhone) from dbo.Contacts`,
        ['coalesce', 'phone', 'mobile', 'workphone', 'homephone', 'alternatephone']
    ),

    // ── CASE with many branches ───────────────────────────────────────────────
    check(
        'case_many_branches',
        `select case Month when 1 then 'January' when 2 then 'February' when 3 then 'March' when 4 then 'April' when 5 then 'May' when 6 then 'June' when 7 then 'July' when 8 then 'August' when 9 then 'September' when 10 then 'October' when 11 then 'November' when 12 then 'December' else 'Unknown' end as MonthName from dbo.Calendar`,
        ['case', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monthname']
    ),

    // ── Nested subqueries ─────────────────────────────────────────────────────
    check(
        'nested_subquery_3_levels',
        `select * from dbo.Orders where CustomerId in (select CustomerId from dbo.Customers where CountryId in (select CountryId from dbo.Countries where Region = 'EMEA'))`,
        ['customers', 'countryid', 'countries', 'region', 'emea']
    ),

    // ── Complex GROUP BY ─────────────────────────────────────────────────────
    check(
        'complex_group_by',
        `select Year, Quarter, Month, Week, ProductId, sum(Revenue) from dbo.Sales group by Year, Quarter, Month, Week, ProductId having sum(Revenue) > 10000`,
        ['group by', 'year', 'quarter', 'month', 'week', 'productid', 'having', 'sum', '10000']
    ),

    // ── Multiple left joins ───────────────────────────────────────────────────
    check(
        'multiple_left_joins',
        `select o.OrderId, c.Name, p.Name as ProdName, s.Name as ShipName from dbo.Orders o left join dbo.Customers c on o.CustomerId = c.Id left join dbo.Products p on o.ProductId = p.Id left join dbo.Shippers s on o.ShipperId = s.Id`,
        ['left join', 'customers', 'products', 'shippers', 'customerid', 'productid', 'shipperid']
    ),

    // ── Long WHERE ────────────────────────────────────────────────────────────
    check(
        'long_where',
        `select * from dbo.Orders where Status = 'Active' and Amount > 100 and CustomerId is not null and OrderDate >= '2024-01-01' and ShipDate <= getdate() and ProductId in (1, 2, 3)`,
        ['status', 'active', 'amount', '100', 'customerid', 'is not null', 'orderdate', 'shipdate', 'getdate', 'productid', 'in']
    ),

    // ── sp_rename ────────────────────────────────────────────────────────────
    check(
        'sp_rename_column',
        `exec sp_rename 'dbo.Orders.OldColumn', 'NewColumn', 'COLUMN'`,
        ['sp_rename', 'orders.oldcolumn', 'newcolumn', 'column']
    ),

    // ── Complex EXEC ─────────────────────────────────────────────────────────
    check(
        'exec_named_params',
        `exec dbo.ProcessOrder @OrderId = 42, @ProcessDate = '2024-01-15', @Force = 1`,
        ['exec', 'processorder', '@orderid', '42', '@processdate', '@force', '1']
    ),

    // ── OVER with complex partition ───────────────────────────────────────────
    check(
        'complex_partition_by',
        `select OrderId, Amount, sum(Amount) over (partition by Year, Quarter, Region order by OrderDate) as RunningTotal from dbo.Sales`,
        ['partition by', 'year', 'quarter', 'region', 'order by', 'orderdate', 'runningtotal']
    ),

    // ── Multiple aggregate window functions ───────────────────────────────────
    check(
        'multiple_window_aggs',
        `select OrderId, Amount, sum(Amount) over w as WinSum, avg(Amount) over w as WinAvg, count(*) over w as WinCount from dbo.Orders window w as (partition by CustomerId order by OrderDate)`,
        ['sum', 'avg', 'count', 'winsum', 'winavg', 'wincount']
    ),

    // ── SELECT with long alias list ───────────────────────────────────────────
    check(
        'many_columns',
        `select OrderId as Id, CustomerId as Cust, ProductId as Prod, Quantity as Qty, UnitPrice as Price, Discount as Disc, TaxRate as Tax, ShippingCost as Ship, TotalAmount as Total, OrderDate as Date from dbo.OrderDetails`,
        ['orderid as id', 'customerid as cust', 'productid as prod', 'quantity as qty', 'unitprice as price', 'discount as disc', 'taxrate as tax', 'shippingcost as ship', 'totalamount as total', 'orderdate as date']
    ),

    // ── OPEN / CLOSE MASTER KEY ───────────────────────────────────────────────
    check(
        'open_close_master_key',
        `open master key decryption by password = 'MasterKeyPassword'; select EncryptByKey(Key_GUID('MySymKey'), SSN) from dbo.Employees; close master key`,
        ['open master key', 'decryption by password', 'close master key']
    ),

    // ── OPEN / CLOSE SYMMETRIC KEY ────────────────────────────────────────────
    check(
        'open_close_symmetric_key',
        `open symmetric key MyKey decryption by certificate MyCert; close symmetric key MyKey`,
        ['open symmetric key', 'mykey', 'decryption by certificate', 'mycert', 'close symmetric key']
    ),

    // ── CREATE CERTIFICATE ────────────────────────────────────────────────────
    check(
        'create_certificate',
        `create certificate MyCert with subject = 'My Test Certificate'`,
        ['create certificate', 'mycert', 'subject', 'my test certificate']
    ),

    // ── CREATE SYMMETRIC KEY ──────────────────────────────────────────────────
    check(
        'create_symmetric_key',
        `create symmetric key MySymKey with algorithm = aes_256 encryption by certificate MyCert`,
        ['create symmetric key', 'mysymkey', 'algorithm', 'aes_256', 'encryption by certificate', 'mycert']
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

console.log(`\nProbe 41 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
