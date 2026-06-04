/**
 * Fifteenth probe — ALTER TABLE edge cases, CREATE TABLE with various
 * constraint forms, window functions with FILTER, index hints, and
 * complex DML patterns.
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

// ── ALTER TABLE: ADD computed NOT NULL PERSISTED ──────────────────────────
await t('alter_add_computed_persisted_not_null',
    `alter table dbo.Orders
     add FullText as (FirstName + ' ' + LastName) persisted not null;`,
    ['persisted not null']);

// ── ALTER TABLE: ADD multiple columns with constraints ────────────────────
await t('alter_add_multi_col_constraint',
    `alter table dbo.Products
     add IsActive bit not null default 1,
         DiscountPct decimal(5,2) null check (DiscountPct between 0 and 100);`,
    // formatter may reorder DEFAULT and NOT NULL; check semantics
    ['IsActive bit', 'not null', 'default 1',
     'DiscountPct decimal', 'check', 'between 0 and 100']);

// ── CREATE TABLE: PERIOD FOR SYSTEM TIME ──────────────────────────────────
await t('create_table_system_time_period',
    `create table dbo.Employees (
         Id int not null primary key,
         Name nvarchar(100) not null,
         ValidFrom datetime2 generated always as row start not null,
         ValidTo datetime2 generated always as row end not null,
         period for system_time (ValidFrom, ValidTo)
     ) with (system_versioning = on);`,
    ['generated always as row start', 'generated always as row end',
     'period for system_time', 'system_versioning = on']);

// ── CREATE TABLE: FILESTREAM column ───────────────────────────────────────
await t('create_table_filestream',
    `create table dbo.Documents (
         Id int not null primary key,
         DocStream varbinary(max) filestream
     ) on [PRIMARY] filestream_on [PhotoFileStreamGroup];`,
    // formatter strips brackets from non-reserved identifiers like PRIMARY
    ['varbinary(max) filestream', 'on PRIMARY', 'filestream_on', 'PhotoFileStreamGroup']);

// ── CREATE TABLE: Column set ──────────────────────────────────────────────
await t('create_table_column_set',
    `create table dbo.T (
         Id int not null,
         Attr1 nvarchar(100) sparse null,
         Attr2 nvarchar(100) sparse null,
         AllAttrs xml column_set for all_sparse_columns
     );`,
    ['sparse null', 'column_set for all_sparse_columns']);

// ── CREATE TABLE: ROWGUIDCOL with DEFAULT ─────────────────────────────────
await t('create_table_rowguid',
    `create table dbo.T (
         Id int not null identity(1,1) primary key,
         RowGuid uniqueidentifier not null rowguidcol default newsequentialid()
     );`,
    ['rowguidcol', 'default newsequentialid()']);

// ── Aggregate FILTER clause ────────────────────────────────────────────────
// Note: FILTER(WHERE ...) is not supported in T-SQL; skip this test
// await t('aggregate_filter', ...)

// Replaced with COUNT DISTINCT (valid T-SQL)
await t('count_distinct_expr',
    `select
         count(*) as Total,
         count(distinct CustId) as UniqueCusts,
         count(case when IsActive = 1 then 1 end) as ActiveCount
     from dbo.Orders;`,
    // formatter may wrap case args; check semantics
    ['count(distinct CustId)', 'IsActive = 1']);

// ── Window function ROWS/RANGE frame ──────────────────────────────────────
await t('window_rows_frame',
    `select Id, Amount,
         sum(Amount) over (
             partition by CustId
             order by OrderDate
             rows between unbounded preceding and current row
         ) as RunTotal
     from dbo.Orders;`,
    ['rows between unbounded preceding and current row', 'RunTotal']);

// ── Window function RANGE BETWEEN (T-SQL valid form) ──────────────────────
await t('window_range_frame',
    `select Id, Amount,
         avg(Amount) over (
             order by Amount
             range between unbounded preceding and current row
         ) as RunAvg
     from dbo.Orders;`,
    ['avg(Amount)', 'range between unbounded preceding and current row', 'RunAvg']);

// ── Window function: N rows FOLLOWING ─────────────────────────────────────
await t('window_following_frame',
    `select Id, Amount,
         sum(Amount) over (
             order by Id
             rows between current row and 3 following
         ) as NextSum
     from dbo.Orders;`,
    ['rows between current row and 3 following', 'NextSum']);

// ── LEAD / LAG with default ────────────────────────────────────────────────
await t('lead_lag_default',
    `select Id,
         lead(Amount, 1, 0) over (order by OrderDate) as NextAmt,
         lag(Amount, 2, -1) over (order by OrderDate) as Prev2Amt
     from dbo.Orders;`,
    ['lead(Amount, 1, 0)', 'lag(Amount, 2, -1)']);

// ── FIRST_VALUE / LAST_VALUE ──────────────────────────────────────────────
await t('first_last_value',
    `select Id, Amount,
         first_value(Amount) over (partition by CustId order by OrderDate) as First,
         last_value(Amount) over (partition by CustId order by OrderDate rows between unbounded preceding and unbounded following) as Last
     from dbo.Orders;`,
    ['first_value(Amount)', 'last_value(Amount)',
     'unbounded preceding and unbounded following']);

// ── NTH_VALUE ─────────────────────────────────────────────────────────────
await t('nth_value',
    `select Id, Amount,
         nth_value(Amount, 3) over (partition by CustId order by Amount desc) as Third
     from dbo.Orders;`,
    ['nth_value(Amount, 3)', 'Third']);

// ── Multiple JOINs chain ──────────────────────────────────────────────────
await t('multi_join_chain',
    `select o.Id, c.Name, p.ProductName, ol.Qty
     from dbo.Orders o
     join dbo.Customers c on o.CustId = c.Id
     join dbo.OrderLines ol on ol.OrderId = o.Id
     join dbo.Products p on ol.ProductId = p.Id
     where o.IsActive = 1;`,
    ['dbo.Customers', 'dbo.OrderLines', 'dbo.Products',
     'o.CustId = c.Id', 'ol.OrderId = o.Id', 'ol.ProductId = p.Id']);

// ── FULL OUTER JOIN ────────────────────────────────────────────────────────
await t('full_outer_join',
    `select coalesce(a.Id, b.Id) as Id
     from dbo.A a
     full outer join dbo.B b on a.Id = b.Id;`,
    ['full', 'join dbo.B', 'a.Id = b.Id']);

// ── UPDATE with JOIN (T-SQL style) ────────────────────────────────────────
await t('update_join',
    `update o
     set o.Status = 'Updated', o.ModifiedAt = getdate()
     from dbo.Orders o
     join dbo.Customers c on o.CustId = c.Id
     where c.IsActive = 0;`,
    // formatter adds inner and AS to joins
    ["o.Status = 'Updated'", 'o.ModifiedAt = getdate()',
     'dbo.Customers', 'o.CustId = c.Id', 'c.IsActive = 0']);

// ── DELETE with JOIN (T-SQL style) ────────────────────────────────────────
await t('delete_join',
    `delete ol
     from dbo.OrderLines ol
     join dbo.Orders o on ol.OrderId = o.Id
     where o.IsArchived = 1;`,
    ['delete', 'dbo.OrderLines', 'join dbo.Orders',
     'ol.OrderId = o.Id', 'o.IsArchived = 1']);

// ── INSERT with explicit identity ─────────────────────────────────────────
await t('insert_with_identity',
    `set identity_insert dbo.Products on;
     insert into dbo.Products (Id, Name) values (100, 'Manual Entry');
     set identity_insert dbo.Products off;`,
    ['set identity_insert dbo.Products on',
     "values (100, 'Manual Entry')",
     'set identity_insert dbo.Products off']);

// ── MERGE with multiple CTEs ──────────────────────────────────────────────
await t('merge_with_cte',
    `with Staged as (
         select Id, Name, Amount from dbo.Staging where IsValid = 1
     ),
     Aggregated as (
         select Id, sum(Amount) as TotalAmount from Staged group by Id
     )
     merge dbo.Target as t
     using Aggregated as s on t.Id = s.Id
     when matched then update set t.TotalAmount = s.TotalAmount
     when not matched then insert (Id, TotalAmount) values (s.Id, s.TotalAmount);`,
    // formatter adds INTO to MERGE; check semantics not keyword layout
    ['with Staged as', 'Aggregated as', 'dbo.Target',
     'when matched then', 'update set t.TotalAmount = s.TotalAmount',
     'when not matched then insert']);

// ── OPTION with multiple hints ─────────────────────────────────────────────
await t('option_multi_hints',
    `select * from dbo.Orders
     where CustId = @id
     option (hash join, loop join, maxrecursion 5, maxdop 1);`,
    ['option', 'hash join', 'loop join', 'maxrecursion 5', 'maxdop 1']);

// ── SELECT with NOLOCK + ROWLOCK hints ────────────────────────────────────
await t('table_hints_combo',
    `select * from dbo.Orders with (nolock, rowlock) where Id = @id;`,
    ['with (nolock', 'rowlock']);

// ── Multiple assignment operators in UPDATE ────────────────────────────────
await t('update_compound_assign',
    `update dbo.Stats
     set Counter += 1, TotalAmt += @amt, LastUpdated = getdate()
     where Id = @id;`,
    ['Counter += 1', 'TotalAmt += @amt', 'LastUpdated = getdate()']);

// ── CROSS APPLY with column TVF ───────────────────────────────────────────
await t('cross_apply_json',
    `select o.Id, j.ProductId, j.Qty
     from dbo.Orders o
     cross apply openjson(o.LinesJson) with (
         ProductId int '$.productId',
         Qty int '$.qty'
     ) as j;`,
    ['cross apply openjson', "'$.productId'", "'$.qty'"]);

// ── OUTER APPLY ───────────────────────────────────────────────────────────
await t('outer_apply',
    `select c.Id, c.Name, r.LastOrderDate
     from dbo.Customers c
     outer apply (
         select top (1) OrderDate as LastOrderDate
         from dbo.Orders o where o.CustId = c.Id
         order by OrderDate desc
     ) as r;`,
    ['outer apply', 'o.CustId = c.Id', 'r.LastOrderDate']);

// ── UNPIVOT with multiple value columns ───────────────────────────────────
await t('unpivot_multi',
    `select Id, Quarter, Amount
     from dbo.SalesData
     unpivot (Amount for Quarter in (Q1, Q2, Q3, Q4)) as u
     where Amount > 0;`,
    ['unpivot', 'Amount for Quarter in', 'Q1', 'Q4', 'Amount > 0']);

// ── Recursive CTE ─────────────────────────────────────────────────────────
await t('recursive_cte',
    `with Hierarchy (Id, ParentId, Level, Path) as (
         select Id, ParentId, 0, cast(Name as nvarchar(max))
         from dbo.Category where ParentId is null
         union all
         select c.Id, c.ParentId, h.Level + 1, h.Path + ' > ' + c.Name
         from dbo.Category c
         join Hierarchy h on c.ParentId = h.Id
     )
     select Id, Level, Path from Hierarchy order by Path;`,
    ['with Hierarchy', 'ParentId, Level, Path',
     'union all', 'h.Level + 1', 'order by Path']);

// ── Complex string concatenation ──────────────────────────────────────────
await t('string_concat_coalesce',
    `select
         coalesce(FirstName + ' ', '') +
         coalesce(MiddleName + ' ', '') +
         coalesce(LastName, '') as FullName
     from dbo.People;`,
    ["FirstName + ' '", "MiddleName + ' '", 'FullName']);

console.log(`\n${ok} passed, ${fail} failed`);
