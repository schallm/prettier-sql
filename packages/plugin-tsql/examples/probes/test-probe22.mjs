/**
 * Twenty-second probe — MERGE into temp tables, INSERT into temp table,
 * table hints with index hints, query hints OPTIMIZE FOR, RECOMPILE,
 * multi-level CTEs, UNION in subquery, EXCEPT/INTERSECT nesting,
 * GOTO/LABEL, PRINT, sp_rename, CREATE RULE/DEFAULT (legacy),
 * DROP TABLE/VIEW/INDEX IF EXISTS, TRUNCATE TABLE.
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

// ── INSERT into #temp table ───────────────────────────────────────────────
await t('insert_temp_table',
    `insert into #TempOrders (Id, Amount)
     select Id, Amount from dbo.Orders where IsActive = 1;`,
    ['insert into #TempOrders', 'select Id, Amount', 'IsActive = 1']);

// ── Table hints with index ────────────────────────────────────────────────
await t('table_hint_index',
    `select * from dbo.Orders with (index(IX_Orders_CustId), nolock)
     where CustId = @id;`,
    ['IX_Orders_CustId', 'nolock']);

// ── OPTIMIZE FOR hint ─────────────────────────────────────────────────────
await t('optimize_for_unknown',
    `select * from dbo.Orders where CustId = @id
     option (optimize for (@id unknown));`,
    ['optimize for', '@id unknown']);

await t('optimize_for_value',
    `select * from dbo.T where Id = @id
     option (optimize for (@id = 42));`,
    ['optimize for', '@id = 42']);

// ── RECOMPILE hint ────────────────────────────────────────────────────────
await t('option_recompile',
    `select * from dbo.Orders where Id = @id option (recompile);`,
    ['option (recompile)']);

// ── OPTION FAST n ─────────────────────────────────────────────────────────
await t('option_fast',
    `select * from dbo.Orders order by Id option (fast 10);`,
    ['option (fast 10)']);

// ── OPTION FORCE ORDER ────────────────────────────────────────────────────
await t('option_force_order',
    `select * from dbo.A join dbo.B on dbo.A.Id = dbo.B.AId option (force order);`,
    ['option (force order)']);

// ── OPTION KEEP PLAN ──────────────────────────────────────────────────────
await t('option_keep_plan',
    `select * from dbo.T where Id = @id option (keep plan, keepfixed plan);`,
    ['keep plan', 'keepfixed plan']);

// ── GOTO / LABEL ──────────────────────────────────────────────────────────
await t('goto_label',
    `declare @i int = 0;
     retry:
     set @i += 1;
     if @i < 3 goto retry;
     select @i;`,
    ['retry:', 'goto retry', '@i < 3', 'set @i += 1']);

// ── PRINT ─────────────────────────────────────────────────────────────────
await t('print_stmt',
    `print N'Starting batch: ' + cast(getdate() as nvarchar(30));`,
    ['print', 'Starting batch', 'getdate()']);

// ── RETURN (with value) ───────────────────────────────────────────────────
await t('return_value',
    `create procedure dbo.usp_Test as
     begin
         if @@error <> 0 return -1;
         return 0;
     end;`,
    ['return -1', 'return 0', '@@error <> 0']);

// ── sp_rename ─────────────────────────────────────────────────────────────
await t('sp_rename_col',
    `exec sp_rename 'dbo.Orders.CustId', 'CustomerId', 'COLUMN';`,
    ["sp_rename", "'dbo.Orders.CustId'", "'COLUMN'"]);

// ── DROP TABLE IF EXISTS ───────────────────────────────────────────────────
await t('drop_table_if_exists',
    `drop table if exists dbo.TempData;`,
    ['drop table if exists dbo.TempData']);

// ── DROP VIEW IF EXISTS ────────────────────────────────────────────────────
await t('drop_view_if_exists',
    `drop view if exists dbo.vOrders;`,
    ['drop view if exists dbo.vOrders']);

// ── DROP INDEX IF EXISTS ───────────────────────────────────────────────────
await t('drop_index_if_exists',
    `drop index if exists IX_Orders_CustId on dbo.Orders;`,
    ['drop index if exists IX_Orders_CustId', 'on dbo.Orders']);

// ── DROP PROCEDURE IF EXISTS ───────────────────────────────────────────────
await t('drop_procedure_if_exists',
    `drop procedure if exists dbo.usp_Test;`,
    ['drop procedure if exists dbo.usp_Test']);

// ── TRUNCATE TABLE ────────────────────────────────────────────────────────
await t('truncate_table',
    `truncate table dbo.Orders;`,
    ['truncate table dbo.Orders']);

// ── UPDATE STATISTICS with options ────────────────────────────────────────
await t('update_stats_sample',
    `update statistics dbo.Orders with sample 10 percent, norecompute;`,
    ['update statistics dbo.Orders', 'sample 10 percent', 'norecompute']);

// ── CREATE STATISTICS ─────────────────────────────────────────────────────
await t('create_stats',
    `create statistics stat_Amount
     on dbo.Orders (Amount, CustId)
     with sample 20 percent, norecompute;`,
    ['create statistics stat_Amount', 'on dbo.Orders', 'Amount, CustId',
     'sample 20 percent', 'norecompute']);

// ── ALTER TABLE ADD MULTIPLE COLUMNS ─────────────────────────────────────
await t('alter_add_multiple_cols',
    `alter table dbo.Orders
     add Col1 int null, Col2 nvarchar(100) null, Col3 bit not null default 0;`,
    ['Col1 int null', 'Col2 nvarchar(100) null', 'Col3 bit', 'not null']);

// ── UNION with ORDER BY in outer query ────────────────────────────────────
await t('union_ordered',
    `select Id, Name from dbo.A
     union all
     select Id, Name from dbo.B
     order by Name asc;`,
    ['union all', 'dbo.A', 'dbo.B', 'order by Name']);

// ── SELECT with multiple APPLY types ─────────────────────────────────────
await t('multi_apply',
    `select o.Id, t.Tag, s.Score
     from dbo.Orders o
     cross apply string_split(o.Tags, ',') as t
     outer apply (
         select avg(Score) as Score from dbo.TagScores ts
         where ts.Tag = t.value
     ) as s;`,
    ['cross apply string_split', 'outer apply', 'avg(Score)']);

// ── MERGE with DELETE clause ──────────────────────────────────────────────
await t('merge_with_delete',
    `merge dbo.Target as t
     using dbo.Source as s on t.Id = s.Id
     when matched and s.IsDeleted = 1 then delete
     when matched then update set t.Name = s.Name
     when not matched then insert (Id, Name) values (s.Id, s.Name);`,
    ['when matched and s.IsDeleted = 1 then delete',
     'when matched then update set t.Name',
     'when not matched then insert']);

// ── DISABLE INDEX ─────────────────────────────────────────────────────────
await t('alter_index_disable',
    `alter index IX_Orders_CustId on dbo.Orders disable;`,
    ['alter index IX_Orders_CustId', 'disable']);

// ── ALTER INDEX ALL REBUILD ───────────────────────────────────────────────
await t('alter_index_all_rebuild',
    `alter index all on dbo.Orders rebuild;`,
    ['alter index all on dbo.Orders rebuild']);

// ── CTE with column list ──────────────────────────────────────────────────
await t('cte_with_columns',
    `with Sales (Region, Quarter, Amount) as (
         select Region, Quarter, sum(Amount) from dbo.T group by Region, Quarter
     )
     select * from Sales order by Region, Quarter;`,
    ['with Sales (Region, Quarter, Amount) as',
     'order by', 'Region', 'Quarter']);

// ── Multiple UNION without ALL ────────────────────────────────────────────
await t('union_distinct',
    `select Id from dbo.A
     union
     select Id from dbo.B
     union
     select Id from dbo.C;`,
    ['union', 'dbo.A', 'dbo.B', 'dbo.C']);

console.log(`\n${ok} passed, ${fail} failed`);
