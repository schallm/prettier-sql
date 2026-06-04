/**
 * Fourteenth probe — ALTER TABLE specifics, DBCC edge cases, complex
 * expressions, SET options, and DML patterns not yet covered.
 */
import prettier from 'prettier';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const plugin = join(__dirname, 'dist/index.js');
const fmt = sql =>
    prettier.format(sql, { parser: 'tsql', plugins: [plugin], printWidth: 80 }).then(r => r.trim());
const norm = s => s.replace(/\s+/g, ' ').toLowerCase();

let ok = 0, fail = 0;
async function t(name, sql, must) {
    let out;
    try { out = await fmt(sql); }
    catch (e) { console.log(`FAIL [${name}] ERROR: ${e.message}`); fail++; return; }
    const no = norm(out);
    const missing = must.filter(m => !no.includes(norm(m)));
    if (missing.length) {
        console.log(`FAIL [${name}] DROPPED: ${missing.join(' | ')}`);
        console.log(out.split('\n').map(l => '  ' + l).join('\n'));
        fail++;
    } else ok++;
}

// ── WITH XMLNAMESPACES + CTE combined ─────────────────────────────────────
await t('xmlnamespaces_with_cte',
    `with xmlnamespaces ('http://example.com' as ex),
     Orders as (select Id from dbo.Orders where IsActive = 1)
     select Id from Orders;`,
    ['xmlnamespaces', "'http://example.com'", 'Orders as', 'IsActive = 1']);

// ── ALTER TABLE: ADD COLUMN with COMPUTED and constraints ─────────────────
await t('alter_add_computed_col',
    `alter table dbo.Orders
     add TaxAmount as (Amount * 0.1) persisted not null,
         DisplayName as (FirstName + ' ' + LastName);`,
    ['add TaxAmount as', 'persisted not null', 'DisplayName as']);

// ── ALTER TABLE: ALTER COLUMN (type change) ────────────────────────────────
await t('alter_col_type',
    `alter table dbo.Products
     alter column Description nvarchar(max) not null;`,
    ['alter column Description', 'nvarchar(max)', 'not null']);

// ── ALTER TABLE: ALTER COLUMN with COLLATE ────────────────────────────────
await t('alter_col_collate',
    `alter table dbo.Products
     alter column Name nvarchar(200) collate Latin1_General_CI_AS not null;`,
    ['alter column Name', 'nvarchar(200)', 'collate Latin1_General_CI_AS']);

// ── ALTER TABLE: WITH CHECK ADD CONSTRAINT ─────────────────────────────────
await t('alter_with_check_add_constraint',
    `alter table dbo.Orders
     with check add constraint CK_Orders_Status
     check (Status in ('Pending', 'Active', 'Completed'));`,
    // formatter may wrap IN(...) with spaces — check semantics
    ['with check add constraint CK_Orders_Status',
     "Status in", "'Pending'", "'Active'", "'Completed'"]);

// ── ALTER TABLE: WITH NOCHECK ADD CONSTRAINT ───────────────────────────────
await t('alter_with_nocheck_add_constraint',
    `alter table dbo.Orders
     with nocheck add constraint FK_Orders_Customers
     foreign key (CustId) references dbo.Customers (Id);`,
    ['with nocheck add constraint FK_Orders_Customers',
     'foreign key (CustId)', 'references dbo.Customers (Id)']);

// ── DBCC FREEPROCCACHE with plan handle ────────────────────────────────────
await t('dbcc_freeproccache_handle',
    `dbcc freeproccache (@plan_handle);`,
    ['dbcc freeproccache', '@plan_handle']);

// ── DBCC TRACEON / TRACEOFF ────────────────────────────────────────────────
await t('dbcc_traceon',
    `dbcc traceon (1222, -1);`,
    ['dbcc traceon', '1222', '-1']);

await t('dbcc_traceoff',
    `dbcc traceoff (1222, -1);`,
    ['dbcc traceoff', '1222', '-1']);

// ── DBCC INPUTBUFFER ──────────────────────────────────────────────────────
await t('dbcc_inputbuffer',
    `dbcc inputbuffer (57);`,
    ['dbcc inputbuffer', '57']);

// ── DBCC OPENTRAN ─────────────────────────────────────────────────────────
await t('dbcc_opentran',
    `dbcc opentran ('MyDatabase') with tableresults;`,
    ['dbcc opentran', "'MyDatabase'", 'tableresults']);

// ── DBCC UPDATEUSAGE ──────────────────────────────────────────────────────
await t('dbcc_updateusage',
    `dbcc updateusage ('MyDatabase', 'dbo.Orders') with count_rows;`,
    ['dbcc updateusage', 'dbo.Orders', 'count_rows']);

// ── DBCC SHOWCONTIG ───────────────────────────────────────────────────────
await t('dbcc_showcontig',
    // SHOWCONTIG takes a table ID not a schema-qualified name; use table name only
    `dbcc showcontig (Orders) with all_indexes;`,
    ['dbcc showcontig', 'all_indexes']);

// ── Complex CASE expression ────────────────────────────────────────────────
await t('complex_case_nested',
    `select
         case
             when Status = 1 then
                 case when Priority > 5 then 'High' else 'Normal' end
             when Status = 2 then 'Completed'
             when Status = 3 and Amount > 1000 then 'Large'
             else 'Unknown'
         end as StatusLabel
     from dbo.Orders;`,
    ['case when Status = 1', "case when Priority > 5 then 'High'",
     "when Status = 2 then 'Completed'", "when Status = 3 and Amount > 1000",
     "'Large'", "'Unknown'"]);

// ── COALESCE with multiple args ────────────────────────────────────────────
await t('coalesce_multi',
    `select coalesce(BillingAddr, ShippingAddr, DefaultAddr, 'N/A') as Addr
     from dbo.Orders;`,
    ['coalesce(BillingAddr, ShippingAddr, DefaultAddr', "'N/A'"]);

// ── NULLIF ─────────────────────────────────────────────────────────────────
await t('nullif_expr',
    `select nullif(DivCount, 0) as SafeDiv, 100.0 / nullif(DivCount, 0) as Pct
     from dbo.Stats;`,
    ['nullif(DivCount, 0)', 'SafeDiv', '100.0 / nullif(DivCount, 0)']);

// ── ISNULL / IS NOT NULL ──────────────────────────────────────────────────
await t('isnull_functions',
    `select isnull(Amount, 0) as Amt, isnull(Name, 'Unknown') as Nm
     from dbo.T
     where Amount is not null and Name is null;`,
    ['isnull(Amount, 0)', "isnull(Name, 'Unknown')", 'is not null', 'is null']);

// ── CAST with style parameter in CONVERT ──────────────────────────────────
await t('convert_with_style',
    `select convert(nvarchar, OrderDate, 103) as BritDate,
            convert(nvarchar, Amount, 2) as FormAmt
     from dbo.Orders;`,
    ['convert(nvarchar, OrderDate, 103)', 'convert(nvarchar, Amount, 2)']);

// ── TRY_CONVERT ────────────────────────────────────────────────────────────
await t('try_convert',
    `select try_convert(int, Col1) as AsInt,
            try_convert(date, Col2, 103) as AsDate
     from dbo.T;`,
    ['try_convert(int, Col1)', 'try_convert(date, Col2, 103)']);

// ── STUFF with character replacement ──────────────────────────────────────
await t('stuff_fn',
    `select stuff(PhoneNumber, 1, 3, '(XXX)') as MaskedPhone from dbo.Users;`,
    ["stuff(PhoneNumber, 1, 3, '(XXX)')"]);

// ── PATINDEX ──────────────────────────────────────────────────────────────
await t('patindex_fn',
    `select patindex('%[0-9]%', Col), patindex('%test%', lower(Col)) from dbo.T;`,
    ["patindex('%[0-9]%', Col)", "patindex('%test%', lower(Col))"]);

// ── CHARINDEX with start ──────────────────────────────────────────────────
await t('charindex_start',
    `select charindex(',', Col, 5) as Pos from dbo.T;`,
    ["charindex(',', Col, 5)"]);

// ── REPLICATE ─────────────────────────────────────────────────────────────
await t('replicate_fn',
    `select replicate('0', 10 - len(cast(Id as nvarchar))) + cast(Id as nvarchar) as PaddedId
     from dbo.T;`,
    ["replicate('0'", "len(cast(Id as nvarchar))"]);

// ── SUBSTRING ─────────────────────────────────────────────────────────────
await t('substring_fn',
    `select substring(Name, 1, 50) as ShortName, substring(Email, charindex('@', Email) + 1, 100) as Domain
     from dbo.Users;`,
    ['substring(Name, 1, 50)', "charindex('@', Email)"]);

// ── DATEADD / DATEDIFF ────────────────────────────────────────────────────
await t('dateadd_datediff',
    `select dateadd(day, -30, getdate()) as Cutoff,
            datediff(day, OrderDate, getdate()) as DaysOld
     from dbo.Orders;`,
    ['dateadd(day, -30, getdate())', 'datediff(day, OrderDate, getdate())']);

// ── SWITCHOFFSET ──────────────────────────────────────────────────────────
await t('switchoffset_fn',
    `select switchoffset(convert(datetimeoffset, OrderDate), '+05:30') as IndiaTime
     from dbo.Orders;`,
    ['switchoffset(convert(datetimeoffset, OrderDate)', "'+05:30'"]);

// ── TODATETIMEOFFSET ──────────────────────────────────────────────────────
await t('todatetimeoffset_fn',
    `select todatetimeoffset(OrderDate, '+00:00') as UtcOffset from dbo.Orders;`,
    ["todatetimeoffset(OrderDate, '+00:00')"]);

// ── CROSS JOIN ────────────────────────────────────────────────────────────
await t('cross_join',
    `select a.Id, b.Id from dbo.A cross join dbo.B;`,
    ['cross join']);

// ── SELF JOIN ─────────────────────────────────────────────────────────────
await t('self_join',
    `select e.Id, e.Name, m.Name as ManagerName
     from dbo.Employees e
     left join dbo.Employees m on e.ManagerId = m.Id;`,
    // formatter adds AS to aliases: dbo.Employees as e
    ['dbo.Employees', 'e.ManagerId = m.Id', 'ManagerName']);

// ── Subquery in FROM ──────────────────────────────────────────────────────
await t('derived_table',
    `select t.Region, t.Total
     from (
         select Region, sum(Amount) as Total
         from dbo.Sales
         group by Region
     ) as t
     where t.Total > 1000;`,
    ['sum(Amount) as Total', 't.Total > 1000']);

// ── Scalar subquery in WHERE ───────────────────────────────────────────────
await t('scalar_subquery_where',
    `select * from dbo.Products
     where Price > (select avg(Price) from dbo.Products where IsActive = 1);`,
    ['avg(Price)', 'IsActive = 1']);

// ── EXISTS with correlated subquery ───────────────────────────────────────
await t('correlated_exists',
    `select * from dbo.Customers c
     where exists (
         select 1 from dbo.Orders o
         where o.CustId = c.Id and o.Status = 'Active'
     );`,
    ['where exists', 'o.CustId = c.Id', "o.Status = 'Active'"]);

// ── ALL / ANY / SOME subqueries ───────────────────────────────────────────
await t('all_any_subquery',
    `select * from dbo.Products
     where Price > all (select Price from dbo.Products where Category = 'Budget');`,
    ['price > all', "category = 'budget'"]);

console.log(`\n${ok} passed, ${fail} failed`);
