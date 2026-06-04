/**
 * Nineteenth probe — APPLY with TVF, STRING_AGG, WITHIN GROUP, OPENJSON with
 * schema, TYPE_ID/OBJECT_ID expressions, CROSS JOIN, TABLESAMPLE, FOR XML,
 * CONTAINS/FREETEXT, scalar UDF in queries, CASE in ORDER BY, IIF,
 * CHOOSE, ISNULL/COALESCE, string functions, CAST/TRY_CAST, CONVERT.
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

// ── STRING_AGG ────────────────────────────────────────────────────────────
await t('string_agg',
    `select CustId, string_agg(Name, ', ') within group (order by Name asc) as Names
     from dbo.Orders group by CustId;`,
    ["string_agg(Name, ', ')", 'within group (order by Name asc)']);

// ── CROSS JOIN ────────────────────────────────────────────────────────────
await t('cross_join',
    `select a.Id, b.Code
     from dbo.TableA a
     cross join dbo.TableB b;`,
    ['cross join dbo.TableB']);

// ── TABLESAMPLE ───────────────────────────────────────────────────────────
await t('tablesample',
    `select Id, Name from dbo.Orders tablesample (10 percent) repeatable (42);`,
    ['tablesample (10 percent)', 'repeatable (42)']);

// ── FOR XML ───────────────────────────────────────────────────────────────
await t('for_xml_path',
    `select Id as '@Id', Name
     from dbo.Orders
     for xml path('Order'), root('Orders');`,
    ['for xml path', "root('Orders')"]);

await t('for_xml_auto',
    `select o.Id, c.Name from dbo.Orders o join dbo.Customers c on o.CustId = c.Id
     for xml auto, elements;`,
    ['for xml auto', 'elements']);

await t('for_xml_raw',
    `select Id, Name from dbo.T for xml raw('Row'), type;`,
    ["for xml raw('Row')", 'type']);

// ── CONTAINS / FREETEXT ───────────────────────────────────────────────────
await t('contains_predicate',
    `select Id, Title from dbo.Articles
     where contains(Body, '"sql server" AND "full text"');`,
    ['contains(Body', 'sql server']);

await t('freetext_predicate',
    `select Id, Title from dbo.Articles
     where freetext(*, 'performance tuning');`,
    ["freetext(*, 'performance tuning')"]);

// ── IIF ───────────────────────────────────────────────────────────────────
await t('iif_expr',
    `select Id, iif(IsActive = 1, 'Active', 'Inactive') as Status from dbo.T;`,
    ["iif(IsActive = 1, 'Active', 'Inactive')"]);

// ── CHOOSE ────────────────────────────────────────────────────────────────
await t('choose_expr',
    `select Id, choose(Quarter, 'Q1', 'Q2', 'Q3', 'Q4') as QName from dbo.T;`,
    ["choose(Quarter, 'Q1', 'Q2', 'Q3', 'Q4')"]);

// ── TRY_CAST / TRY_CONVERT ────────────────────────────────────────────────
await t('try_cast',
    `select try_cast(Col as int) as IntVal from dbo.T;`,
    ['try_cast(Col as int)']);

await t('try_convert',
    `select try_convert(datetime2, Col, 126) as DtVal from dbo.T;`,
    ['try_convert(datetime2, Col, 126)']);

// ── CONVERT with style ────────────────────────────────────────────────────
await t('convert_style',
    `select convert(nvarchar(20), OrderDate, 101) as FormattedDate from dbo.Orders;`,
    ['convert(nvarchar(20), OrderDate, 101)']);

// ── CASE in ORDER BY ──────────────────────────────────────────────────────
await t('case_in_order_by',
    `select Id, Status from dbo.Orders
     order by case Status
                  when 'Pending' then 1
                  when 'Active' then 2
                  else 3
              end, Id;`,
    ["case Status when 'Pending' then 1", "when 'Active' then 2", 'else 3']);

// ── CASE in GROUP BY ──────────────────────────────────────────────────────
await t('case_in_group_by',
    `select
         case when Amount < 100 then 'Low' when Amount < 1000 then 'Med' else 'High' end as Tier,
         count(*) as Cnt
     from dbo.Orders
     group by case when Amount < 100 then 'Low' when Amount < 1000 then 'Med' else 'High' end;`,
    ['case when Amount < 100', "'Low'", "'Med'", "'High'"]);

// ── STUFF / CHARINDEX ─────────────────────────────────────────────────────
await t('stuff_charindex',
    `select stuff(Name, charindex(' ', Name), 1, '_') as Modified from dbo.T;`,
    ['stuff(Name', 'charindex']);

// ── PATINDEX ──────────────────────────────────────────────────────────────
await t('patindex',
    `select patindex('%[0-9]%', Name) as FirstDigitPos from dbo.T;`,
    ["patindex('%[0-9]%', Name)"]);

// ── FORMAT function ───────────────────────────────────────────────────────
await t('format_func',
    `select format(Amount, 'C2', 'en-US') as FormattedAmt from dbo.T;`,
    ["format(Amount, 'C2', 'en-US')"]);

// ── CROSS APPLY with inline TVF ───────────────────────────────────────────
await t('cross_apply_tvf',
    `select o.Id, t.Tag
     from dbo.Orders o
     cross apply dbo.fn_GetTags(o.Id) as t;`,
    ['cross apply dbo.fn_GetTags(o.Id)']);

// ── OUTER APPLY with subquery ─────────────────────────────────────────────
await t('outer_apply_subq',
    `select c.Id, x.LatestAmt
     from dbo.Customers c
     outer apply (
         select top (1) Amount as LatestAmt
         from dbo.Orders o where o.CustId = c.Id
         order by OrderDate desc
     ) as x;`,
    ['outer apply', 'o.CustId = c.Id', 'LatestAmt']);

// ── OPENJSON with explicit schema ─────────────────────────────────────────
await t('openjson_schema',
    `select Id, Name, IsActive
     from openjson(@json) with (
         Id int '$.id',
         Name nvarchar(100) '$.name',
         IsActive bit '$.active'
     );`,
    ['openjson', "'$.id'", "'$.name'", "'$.active'"]);

// ── OBJECT_ID / TYPE_ID in WHERE ──────────────────────────────────────────
await t('object_id_expr',
    `select * from sys.columns where object_id = object_id('dbo.Orders');`,
    ["object_id('dbo.Orders')"]);

// ── SCOPE_IDENTITY / @@IDENTITY ───────────────────────────────────────────
await t('scope_identity',
    `insert into dbo.Orders (Name) values ('Test');
     select scope_identity() as NewId, @@identity as AltId;`,
    ['scope_identity()', '@@identity']);

// ── Multiple CTEs with aggregation ────────────────────────────────────────
await t('multi_cte_agg',
    `with Monthly as (
         select year(OrderDate) as Yr, month(OrderDate) as Mo, sum(Amount) as Total
         from dbo.Orders group by year(OrderDate), month(OrderDate)
     ),
     YearlyAvg as (
         select Yr, avg(Total) as AvgMonthly from Monthly group by Yr
     )
     select m.Yr, m.Mo, m.Total, y.AvgMonthly
     from Monthly m join YearlyAvg y on m.Yr = y.Yr
     order by m.Yr, m.Mo;`,
    ['with Monthly as', 'YearlyAvg as', 'avg(Total) as AvgMonthly',
     'order by', 'm.Yr', 'm.Mo']);

// ── EXCEPT / INTERSECT ────────────────────────────────────────────────────
await t('except_intersect',
    `select Id from dbo.A
     except
     select Id from dbo.B
     intersect
     select Id from dbo.C;`,
    ['except', 'intersect', 'dbo.A', 'dbo.B', 'dbo.C']);

// ── Subquery in SELECT ────────────────────────────────────────────────────
await t('subquery_in_select',
    `select Id, (select count(*) from dbo.OrderLines ol where ol.OrderId = o.Id) as LineCount
     from dbo.Orders o;`,
    ['select count(*)', 'ol.OrderId = o.Id', 'LineCount']);

// ── EXISTS in WHERE ───────────────────────────────────────────────────────
await t('exists_in_where',
    `select Id from dbo.Orders o
     where exists (select 1 from dbo.OrderLines ol where ol.OrderId = o.Id and ol.IsReturn = 1);`,
    ['where exists', 'ol.OrderId = o.Id', 'ol.IsReturn = 1']);

// ── NOT EXISTS ────────────────────────────────────────────────────────────
await t('not_exists',
    `select Id from dbo.Customers c
     where not exists (select 1 from dbo.Orders o where o.CustId = c.Id);`,
    ['not exists', 'o.CustId = c.Id']);

console.log(`\n${ok} passed, ${fail} failed`);
