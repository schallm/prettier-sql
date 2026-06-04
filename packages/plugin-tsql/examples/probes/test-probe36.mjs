/**
 * Probe 36 — Stored procedures and functions deep coverage:
 *   - Proc with RECOMPILE / ENCRYPTION / EXECUTE AS
 *   - OUTPUT parameters (multiple)
 *   - DEFAULT parameter values (NULL, string, number, function)
 *   - RETURNS TABLE with complex column definitions
 *   - Recursive CTE in a function
 *   - CASE in SELECT with multiple WHEN/THEN
 *   - Subquery in SELECT column
 *   - Correlated subquery in WHERE
 *   - EXISTS / NOT EXISTS
 *   - IN / NOT IN with subquery
 *   - ANY / ALL comparisons
 *   - CROSS JOIN
 *   - FULL OUTER JOIN
 *   - Self-join
 *   - Multiple CTEs
 *   - CTE with recursive anchor
 *   - UNION ALL with CTEs
 *   - GROUP BY GROUPING SETS / ROLLUP / CUBE
 *   - HAVING with aggregate
 *   - DISTINCT with ORDER BY
 *   - SELECT with INTO #temp
 *   - Complex UPDATE with subquery
 *   - DELETE with JOIN
 *   - IF EXISTS (subquery pattern)
 *   - COALESCE / NULLIF / ISNULL / ISNUMERIC / ISJSON
 *   - STRING_AGG
 *   - JSON_VALUE / JSON_QUERY / JSON_MODIFY / OPENJSON
 *   - COMPRESS / DECOMPRESS
 *   - HASHBYTES / CHECKSUM
 *   - NEWID / NEWSEQUENTIALID
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
    // ── Proc options ──────────────────────────────────────────────────────────
    check(
        'proc_recompile_encryption',
        `create procedure dbo.GetOrders with recompile, encryption as begin select * from dbo.Orders end`,
        ['create', 'procedure', 'getorders', 'with', 'recompile', 'encryption', 'select', 'orders']
    ),
    check(
        'proc_execute_as',
        `create procedure dbo.SecureProc with execute as owner as begin select 1 end`,
        ['create', 'procedure', 'secureproc', 'execute', 'as', 'owner']
    ),

    // ── OUTPUT parameters ─────────────────────────────────────────────────────
    check(
        'output_params',
        `create procedure dbo.GetSummary @CustomerId int, @TotalOrders int output, @TotalAmount decimal(18,2) output as begin select @TotalOrders = count(*), @TotalAmount = sum(Amount) from dbo.Orders where CustomerId = @CustomerId end`,
        ['output', '@totalorders', '@totalamount', 'decimal', 'count', 'sum']
    ),

    // ── DEFAULT parameter values ──────────────────────────────────────────────
    check(
        'default_params',
        `create procedure dbo.ListOrders @Status nvarchar(20) = 'Active', @MaxRows int = 100, @Since datetime = null as begin select top (@MaxRows) * from dbo.Orders where Status = @Status and (@Since is null or OrderDate >= @Since) end`,
        ['nvarchar', '= \'active\'', '= 100', '= null', 'top', '@maxrows', '@since', 'is null', 'orderdate']
    ),

    // ── CASE expression ───────────────────────────────────────────────────────
    check(
        'case_expression',
        `select OrderId, case when Amount < 100 then 'Small' when Amount < 1000 then 'Medium' else 'Large' end as Size from dbo.Orders`,
        ['case', 'when', 'amount', '<', '100', 'small', 'medium', 'else', 'large', 'end', 'size']
    ),
    check(
        'case_searched',
        `select OrderId, case Status when 'Pending' then 1 when 'Shipped' then 2 when 'Delivered' then 3 else 0 end as StatusCode from dbo.Orders`,
        ['case', 'status', 'when', 'pending', 'shipped', 'delivered', 'else', '0', 'statuscode']
    ),

    // ── Subqueries ────────────────────────────────────────────────────────────
    check(
        'subquery_in_select',
        `select OrderId, (select count(*) from dbo.Items where OrderId = o.OrderId) as ItemCount from dbo.Orders o`,
        ['select', 'count', 'items', 'orderid', 'itemcount']
    ),
    check(
        'correlated_subquery_where',
        `select * from dbo.Customers c where exists (select 1 from dbo.Orders o where o.CustomerId = c.CustomerId and o.Amount > 1000)`,
        ['exists', 'customers', 'orders', 'customerid', 'amount', '1000']
    ),
    check(
        'not_exists',
        `select * from dbo.Customers c where not exists (select 1 from dbo.Orders where CustomerId = c.CustomerId)`,
        ['not', 'exists', 'customers', 'orders', 'customerid']
    ),
    check(
        'in_subquery',
        `select * from dbo.Orders where CustomerId in (select Id from dbo.Customers where Country = 'US')`,
        ['in', 'customerid', 'id', 'customers', 'country', 'us']
    ),
    check(
        'not_in_subquery',
        `select * from dbo.Orders where CustomerId not in (select Id from dbo.Blacklist)`,
        ['not in', 'customerid', 'blacklist']
    ),

    // ── Complex joins ─────────────────────────────────────────────────────────
    check(
        'cross_join',
        `select a.Name, b.Name from dbo.Categories a cross join dbo.Tags b`,
        ['cross join', 'categories', 'tags']
    ),
    check(
        'full_outer_join',
        `select c.Name, o.OrderId from dbo.Customers c full outer join dbo.Orders o on c.CustomerId = o.CustomerId`,
        ['full outer join', 'customers', 'orders', 'customerid']
    ),
    check(
        'self_join',
        `select e.Name, m.Name as ManagerName from dbo.Employees e left join dbo.Employees m on e.ManagerId = m.EmployeeId`,
        ['employees', 'managerid', 'managername', 'left join']
    ),

    // ── GROUP BY advanced ─────────────────────────────────────────────────────
    check(
        'grouping_sets',
        `select Year, Quarter, sum(Amount) from dbo.Sales group by grouping sets ((Year, Quarter), (Year), ())`,
        ['group by', 'grouping sets', 'year', 'quarter', 'sum', 'amount']
    ),
    check(
        'rollup',
        `select Country, Region, sum(Sales) from dbo.Territory group by rollup (Country, Region)`,
        ['group by', 'rollup', 'country', 'region', 'sum', 'sales']
    ),
    check(
        'cube',
        `select Product, Region, sum(Revenue) from dbo.Sales group by cube (Product, Region)`,
        ['group by', 'cube', 'product', 'region', 'sum', 'revenue']
    ),

    // ── Multiple CTEs / recursive ─────────────────────────────────────────────
    check(
        'multiple_ctes',
        `with HighValue as (select CustomerId from dbo.Orders group by CustomerId having sum(Amount) > 10000), Recent as (select CustomerId from dbo.Orders where OrderDate >= '2024-01-01') select * from HighValue h join Recent r on h.CustomerId = r.CustomerId`,
        ['with', 'highvalue', 'having', 'sum', '10000', 'recent', 'orderdate', 'join']
    ),
    check(
        'recursive_cte',
        `with Numbers as (select 1 as N union all select N + 1 from Numbers where N < 10) select * from Numbers`,
        ['with', 'numbers', 'union all', 'select', '1', 'as n', 'where', '< 10']
    ),

    // ── NULL handling functions ───────────────────────────────────────────────
    check(
        'null_functions',
        `select coalesce(Phone, Mobile, 'N/A'), nullif(Status, 'Unknown'), isnull(Amount, 0), isnumeric('123') from dbo.Customers`,
        ['coalesce', 'phone', 'mobile', 'nullif', 'status', 'unknown', 'isnull', 'isnumeric']
    ),

    // ── STRING_AGG ────────────────────────────────────────────────────────────
    check(
        'string_agg',
        `select CustomerId, string_agg(ProductName, ', ') within group (order by ProductName) as Products from dbo.OrderItems group by CustomerId`,
        ['string_agg', 'productname', 'within group', 'order by', 'products']
    ),

    // ── JSON functions ────────────────────────────────────────────────────────
    check(
        'json_value_query',
        `select json_value(Data, '$.name') as Name, json_query(Data, '$.address') as Address from dbo.Customers`,
        ['json_value', '$.name', 'json_query', '$.address', 'address']
    ),
    check(
        'openjson',
        `select key, value, type from openjson(@json) with (Name nvarchar(100) '$.name', Age int '$.age')`,
        ['openjson', 'nvarchar', 'age', 'int', '$.name', '$.age']
    ),
    check(
        'json_modify',
        `update dbo.Customers set Data = json_modify(Data, '$.phone', @newPhone) where CustomerId = @id`,
        ['update', 'json_modify', '$.phone', '@newphone', 'where', '@id']
    ),

    // ── HASHBYTES / NEWID ─────────────────────────────────────────────────────
    check(
        'hashbytes_newid',
        `select hashbytes('SHA2_256', Email), newid(), newsequentialid() from dbo.Customers`,
        ['hashbytes', 'sha2_256', 'email', 'newid', 'newsequentialid']
    ),

    // ── Complex UPDATE with subquery ──────────────────────────────────────────
    check(
        'update_from_subquery',
        `update o set o.Status = 'Shipped', o.ShippedDate = getdate() from dbo.Orders o inner join dbo.Shipments s on o.OrderId = s.OrderId where s.ShippedDate is not null and o.Status = 'Pending'`,
        ['update', 'set', 'shipped', 'getdate', 'from', 'orders', 'shipments', 'shippedate', 'where', 'is not null', 'pending']
    ),

    // ── DELETE with JOIN ──────────────────────────────────────────────────────
    check(
        'delete_with_join',
        `delete o from dbo.Orders o inner join dbo.Customers c on o.CustomerId = c.CustomerId where c.IsDeleted = 1`,
        ['delete', 'from', 'orders', 'customers', 'customerid', 'isdeleted', '= 1']
    ),

    // ── IF EXISTS pattern ─────────────────────────────────────────────────────
    check(
        'if_exists_select',
        `if exists (select 1 from dbo.Orders where CustomerId = @id and Status = 'Active') begin print 'found' end`,
        ['if', 'exists', 'select', 'customerid', '@id', 'status', 'active', 'begin', 'print', 'found', 'end']
    ),

    // ── ISJSON ────────────────────────────────────────────────────────────────
    check(
        'isjson',
        `select * from dbo.Customers where isjson(Data) = 1`,
        ['isjson', 'data', '= 1']
    ),

    // ── HAVING ────────────────────────────────────────────────────────────────
    check(
        'having',
        `select CustomerId, count(*) as OrderCount, avg(Amount) as AvgAmount from dbo.Orders group by CustomerId having count(*) > 5 and avg(Amount) > 100`,
        ['having', 'count', '> 5', 'avg', '> 100']
    ),

    // ── SELECT DISTINCT with ORDER BY ─────────────────────────────────────────
    check(
        'distinct_order_by',
        `select distinct Country, Region from dbo.Customers order by Country, Region`,
        ['distinct', 'country', 'region', 'order by']
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

console.log(`\nProbe 36 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
