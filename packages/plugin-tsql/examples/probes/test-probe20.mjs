/**
 * Twentieth probe — ALTER TABLE edge cases (REBUILD, SWITCH PARTITION,
 * DISABLE/ENABLE constraints), DBCC variants, system catalog queries,
 * dynamic SQL, sp_executesql, table-valued params, APPLY with STRING_SPLIT,
 * ROWS/RANGE frames, conditional aggregates, OUTPUT into table variable.
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

// ── ALTER TABLE REBUILD ────────────────────────────────────────────────────
await t('alter_table_rebuild',
    `alter table dbo.Orders rebuild with (data_compression = page, online = on);`,
    ['alter table dbo.Orders rebuild', 'data_compression = page', 'online = on']);

// ── ALTER TABLE SWITCH PARTITION ──────────────────────────────────────────
await t('alter_table_switch',
    `alter table dbo.Orders switch partition 3 to dbo.OrdersArchive partition 3;`,
    ['alter table dbo.Orders', 'switch partition 3', 'dbo.OrdersArchive', 'partition 3']);

// ── ALTER TABLE DISABLE/ENABLE CONSTRAINT ─────────────────────────────────
await t('alter_table_disable_constraint',
    `alter table dbo.Orders nocheck constraint FK_Orders_Customers;`,
    ['alter table dbo.Orders', 'nocheck constraint FK_Orders_Customers']);

await t('alter_table_enable_constraint',
    `alter table dbo.Orders check constraint all;`,
    ['alter table dbo.Orders', 'check constraint all']);

// ── DBCC CHECKDB ───────────────────────────────────────────────────────────
await t('dbcc_checkdb',
    `dbcc checkdb ('MyDatabase') with no_infomsgs, all_errormsgs;`,
    ['dbcc checkdb', 'MyDatabase', 'no_infomsgs', 'all_errormsgs']);

// ── DBCC SHRINKFILE ────────────────────────────────────────────────────────
await t('dbcc_shrinkfile',
    `dbcc shrinkfile (N'MyDatabase_log', 1);`,
    ['dbcc shrinkfile', 'MyDatabase_log', '1']);

// ── DBCC FREEPROCCACHE ────────────────────────────────────────────────────
await t('dbcc_freeproccache',
    `dbcc freeproccache;`,
    ['dbcc freeproccache']);

// ── DBCC DROPCLEANBUFFERS ─────────────────────────────────────────────────
await t('dbcc_dropcleanbuffers',
    `dbcc dropcleanbuffers;`,
    ['dbcc dropcleanbuffers']);

// ── Dynamic SQL with sp_executesql ────────────────────────────────────────
await t('sp_executesql',
    `declare @sql nvarchar(max) = N'select * from dbo.Orders where Id = @Id';
     exec sp_executesql @sql, N'@Id int', @Id = 42;`,
    ['sp_executesql', "@Id int", '@Id = 42']);

// ── Dynamic SQL: EXEC with string ─────────────────────────────────────────
await t('exec_string',
    `declare @sql nvarchar(max);
     set @sql = N'select count(*) from ' + quotename(@tablename);
     exec (@sql);`,
    ['execute (@sql)', 'quotename(@tablename)']);

// ── TABLE-VALUED PARAMETER ────────────────────────────────────────────────
await t('tvp_usage',
    `create type dbo.OrderIdList as table (Id int not null primary key);`,
    ['create type dbo.OrderIdList as table', 'Id int not null primary key']);

// ── STRING_SPLIT ──────────────────────────────────────────────────────────
await t('string_split',
    `select value as Tag
     from string_split(@tags, ',')
     where trim(value) <> '';`,
    ['string_split(@tags', 'trim', "<> ''"]);

// ── CROSS APPLY STRING_SPLIT ──────────────────────────────────────────────
await t('cross_apply_string_split',
    `select o.Id, s.value as Tag
     from dbo.Orders o
     cross apply string_split(o.Tags, ',') as s;`,
    ['cross apply string_split(o.Tags', "',')"]);

// ── CUME_DIST / PERCENT_RANK ──────────────────────────────────────────────
await t('cume_dist',
    `select Id, Amount,
         cume_dist() over (order by Amount) as CumeDist,
         percent_rank() over (order by Amount) as PctRank
     from dbo.Orders;`,
    ['cume_dist()', 'percent_rank()', 'CumeDist', 'PctRank']);

// ── NTILE ─────────────────────────────────────────────────────────────────
await t('ntile',
    `select Id, ntile(4) over (order by Amount desc) as Quartile from dbo.Orders;`,
    ['ntile(4)', 'Quartile']);

// ── SUM OVER PARTITION (running total) ────────────────────────────────────
await t('running_total',
    `select
         Id,
         sum(Amount) over (partition by CustId order by OrderDate
                           rows between unbounded preceding and current row) as RunTotal
     from dbo.Orders;`,
    ['sum(Amount)', 'partition by CustId', 'order by OrderDate',
     'rows between unbounded preceding and current row', 'RunTotal']);

// ── Conditional aggregation ───────────────────────────────────────────────
await t('conditional_agg',
    `select
         count(case when Status = 'Pending' then 1 end) as PendingCnt,
         sum(case when IsActive = 1 then Amount else 0 end) as ActiveAmt,
         avg(case when Region = 'US' then Amount end) as UsAvg
     from dbo.Orders;`,
    ["case when Status = 'Pending'", 'case when IsActive = 1',
     "case when Region = 'US'"]);

// ── OUTPUT into table variable ────────────────────────────────────────────
await t('output_into_table_var',
    `declare @deleted table (Id int, Amount decimal(10,2));
     delete from dbo.Orders
     output deleted.Id, deleted.Amount into @deleted
     where IsArchived = 1;
     select sum(Amount) as Total from @deleted;`,
    ['output deleted.Id, deleted.Amount', 'into @deleted',
     'sum(Amount) as Total', 'from @deleted']);

// ── UPDATE from subquery ──────────────────────────────────────────────────
await t('update_from_subquery',
    `update o
     set o.TotalLines = sub.Cnt
     from dbo.Orders o
     join (
         select OrderId, count(*) as Cnt from dbo.OrderLines group by OrderId
     ) sub on sub.OrderId = o.Id;`,
    ['o.TotalLines = sub.Cnt', 'sub.OrderId = o.Id', 'count(*) as Cnt']);

// ── INSERT from SELECT with TOP ───────────────────────────────────────────
await t('insert_select_top',
    `insert into dbo.Archive (Id, Name, Amount)
     select top (1000) Id, Name, Amount
     from dbo.Orders
     where IsArchived = 0
     order by CreatedAt asc;`,
    ['insert into dbo.Archive', 'select top (1000)', 'order by CreatedAt']);

// ── AT TIME ZONE ──────────────────────────────────────────────────────────
await t('at_time_zone',
    `select OrderDate at time zone 'UTC' at time zone 'Pacific Standard Time' as PSTDate
     from dbo.Orders;`,
    ['at time zone', "'UTC'", "'Pacific Standard Time'"]);

// ── DATETIMEOFFSET arithmetic ─────────────────────────────────────────────
await t('datetimeoffset_funcs',
    `select
         switchoffset(OrderDate, '+05:30') as IST,
         todatetimeoffset(OrderDate, '-08:00') as PST
     from dbo.Orders;`,
    ['switchoffset', "'+05:30'", 'todatetimeoffset', "'-08:00'"]);

// ── CASE WHEN IS NULL ─────────────────────────────────────────────────────
await t('case_is_null',
    `select Id,
         case when Notes is null then 'No Notes' else Notes end as NoteText
     from dbo.T;`,
    ['case when Notes is null', "'No Notes'"]);

// ── NULLIF ────────────────────────────────────────────────────────────────
await t('nullif_expr',
    `select nullif(Discount, 0) as NonZeroDiscount from dbo.T;`,
    ['nullif(Discount, 0)', 'NonZeroDiscount']);

// ── UPDATE with CASE ──────────────────────────────────────────────────────
await t('update_with_case',
    `update dbo.Orders
     set Priority = case
                        when Amount > 1000 then 'High'
                        when Amount > 100 then 'Med'
                        else 'Low'
                    end
     where IsActive = 1;`,
    ["case when Amount > 1000 then 'High'", "'Med'", "'Low'",
     'where IsActive = 1']);

console.log(`\n${ok} passed, ${fail} failed`);
