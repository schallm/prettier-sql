/**
 * Third semantic-safety probe — DDL and DML edge cases.
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

// ── OUTPUT / READONLY parameters ──────────────────────────────────────────────
await t('proc_output_param',
    `create procedure dbo.usp_GetTotal @Id int, @Total decimal(10,2) output as begin select @Total = 100; end;`,
    ['@Total decimal(10,2)', 'output']);

await t('proc_readonly_param',
    `create procedure dbo.usp_Test @Ids dbo.IntList readonly as begin select * from @Ids; end;`,
    ['readonly', 'dbo.IntList']);

// ── DEFAULT parameter values ───────────────────────────────────────────────
await t('proc_default_param',
    `create procedure dbo.usp_Find @Name nvarchar(100) = null, @Active bit = 1 as begin select @Name, @Active; end;`,
    ["@Name nvarchar(100) = null", "@Active bit = 1"]);

// ── WAITFOR ───────────────────────────────────────────────────────────────
await t('waitfor_delay',
    `waitfor delay '00:00:05';`,
    ['waitfor delay', "'00:00:05'"]);

await t('waitfor_time',
    `waitfor time '14:30:00';`,
    ['waitfor time', "'14:30:00'"]);

// ── THROW ──────────────────────────────────────────────────────────────────
await t('throw_stmt',
    `throw 50001, 'Something went wrong', 1;`,
    ['throw', '50001', "'Something went wrong'", '1']);

await t('throw_rethrow',
    `begin try select 1/0; end try begin catch throw; end catch;`,
    ['throw']);

// ── TRY/CATCH with error functions ────────────────────────────────────────
await t('try_catch_errors',
    `begin try select 1/0; end try begin catch
        declare @msg nvarchar(max) = error_message();
        declare @sev int = error_severity();
        raiserror(@msg, @sev, 1);
     end catch;`,
    ['error_message()', 'error_severity()', 'raiserror']);

// ── PRINT ──────────────────────────────────────────────────────────────────
await t('print_stmt',
    `print 'Hello, World!';`,
    ["print", "'Hello, World!'"]);

await t('print_variable',
    `print @x;`,
    ['print', '@x']);

// ── EXECUTE string ────────────────────────────────────────────────────────
await t('exec_string',
    `exec ('select 1');`,
    ['exec', "'select 1'"]);

await t('exec_sp_with_named',
    `exec sp_executesql @sql, @params, @Id = @myId;`,
    ['sp_executesql', '@params', '@Id = @myId']);

// ── SELECT INTO ───────────────────────────────────────────────────────────
await t('select_into',
    `select Id, Name into #TempOrders from dbo.Orders where IsActive = 1;`,
    ['into #TempOrders', 'IsActive = 1']);

// ── INSERT EXEC ───────────────────────────────────────────────────────────
await t('insert_exec',
    `insert into #Results exec dbo.usp_GetData @StartDate = '2024-01-01';`,
    ['insert into #Results', 'exec', 'usp_GetData', "@StartDate = '2024-01-01'"]);

// ── OUTPUT clause on INSERT ───────────────────────────────────────────────
await t('insert_output',
    `insert into dbo.Log (Action) output inserted.Id, inserted.Action into @ResultTable values ('created');`,
    ['output inserted.Id', 'into @ResultTable', "'created'"]);

// ── OUTPUT clause on UPDATE ───────────────────────────────────────────────
await t('update_output',
    `update dbo.Orders set Status = 'Shipped' output deleted.Status, inserted.Status into @Changes where Id = 1;`,
    ['output deleted.Status', 'inserted.Status', 'into @Changes']);

// ── OUTPUT clause on DELETE ───────────────────────────────────────────────
await t('delete_output',
    `delete from dbo.Orders output deleted.Id, deleted.Amount into @Deleted where Status = 'Cancelled';`,
    ['output deleted.Id', 'deleted.Amount', 'into @Deleted']);

// ── MERGE with OUTPUT ─────────────────────────────────────────────────────
await t('merge_output',
    `merge dbo.Target as t using dbo.Source as s on t.Id = s.Id
     when matched then update set t.Name = s.Name
     output $action, inserted.Id into @MergeLog;`,
    ['output $action', 'inserted.Id', 'into @MergeLog']);

// ── CTE (WITH) ────────────────────────────────────────────────────────────
await t('cte_basic',
    `with ActiveOrders as (
        select Id, Amount from dbo.Orders where IsActive = 1
     )
     select * from ActiveOrders;`,
    ['with ActiveOrders as', 'IsActive = 1']);

await t('cte_recursive',
    `with Hierarchy as (
        select Id, ParentId, 1 as Level from dbo.Categories where ParentId is null
        union all
        select c.Id, c.ParentId, h.Level + 1 from dbo.Categories c
        join Hierarchy h on c.ParentId = h.Id
     )
     select * from Hierarchy;`,
    // formatter normalises: join -> inner join, alias -> as h — check semantics only
    ['union all', 'h.Level + 1', 'c.ParentId = h.Id']);

// ── PIVOT ──────────────────────────────────────────────────────────────────
await t('pivot',
    `select Year, [Q1], [Q2], [Q3], [Q4]
     from dbo.Sales
     pivot (sum(Amount) for Quarter in ([Q1],[Q2],[Q3],[Q4])) as pvt;`,
    ['pivot', 'sum(Amount)', 'for Quarter in', '[Q1]', '[Q4]']);

// ── UNPIVOT ───────────────────────────────────────────────────────────────
await t('unpivot',
    `select Product, Quarter, Amount
     from dbo.Sales
     unpivot (Amount for Quarter in (Q1, Q2, Q3, Q4)) as upvt;`,
    ['unpivot', 'Amount for Quarter in', 'Q4']);

// ── APPLY ──────────────────────────────────────────────────────────────────
await t('cross_apply',
    `select o.Id, v.Price from dbo.Orders o cross apply dbo.fn_GetPrices(o.Id) v;`,
    ['cross apply', 'dbo.fn_GetPrices', 'o.Id']);

await t('outer_apply',
    `select o.Id, v.Price from dbo.Orders o outer apply dbo.fn_GetPrices(o.Id) v;`,
    ['outer apply']);

// ── FOR XML ───────────────────────────────────────────────────────────────
await t('for_xml_path',
    `select Id, Name from dbo.Orders for xml path('Order'), root('Orders');`,
    ['for xml path', "'Order'", "root('Orders')"]);

// ── TOP WITH TIES ─────────────────────────────────────────────────────────
await t('top_with_ties',
    `select top (10) with ties Id, Amount from dbo.Orders order by Amount desc;`,
    ['with ties', 'top (10)', 'order by Amount desc']);

// ── OPTION hints ─────────────────────────────────────────────────────────
await t('option_recompile',
    `select * from dbo.Orders where Status = @s option (recompile);`,
    ['option (recompile)']);

await t('option_maxdop',
    `select * from dbo.Orders option (maxdop 4, optimize for unknown);`,
    ['maxdop 4', 'optimize for unknown']);

await t('option_use_hint',
    `select * from dbo.T option (use hint ('DISABLE_OPTIMIZED_PLAN_FORCING'));`,
    ["use hint", "DISABLE_OPTIMIZED_PLAN_FORCING"]);

// ── CREATE TABLE: DEFAULT constraint with name ────────────────────────────
await t('named_default_constraint',
    `create table dbo.Orders (
        Id int not null,
        Status nvarchar(20) not null constraint DF_Status default ('Pending')
     );`,
    ["constraint DF_Status", "default ('Pending')"]);

// ── INSERT DEFAULT VALUES ──────────────────────────────────────────────────
await t('insert_default_values',
    `insert into dbo.Audit default values;`,
    ['insert into dbo.Audit', 'default values']);

// ── DELETE with JOIN (FROM alias) ────────────────────────────────────────
await t('delete_with_from',
    `delete o from dbo.Orders o join dbo.Customers c on o.CustId = c.Id where c.IsActive = 0;`,
    // formatter adds inner/as — check semantics: target alias, ON condition, WHERE
    ['delete o', 'dbo.Customers', 'o.CustId = c.Id', 'IsActive = 0']);

// ── UPDATE with FROM join ─────────────────────────────────────────────────
await t('update_from_join',
    `update o set o.Status = 'Expired' from dbo.Orders o join dbo.Customers c on o.CustId = c.Id where c.IsDeleted = 1;`,
    // formatter adds inner/as — check semantics
    ["o.Status = 'Expired'", 'dbo.Customers', 'o.CustId = c.Id', 'IsDeleted = 1']);

// ── OVER clause: PARTITION BY ─────────────────────────────────────────────
await t('over_partition',
    `select Id, sum(Amount) over (partition by CustId order by OrderDate) as RunningTotal from dbo.Orders;`,
    ['partition by CustId', 'RunningTotal']);

// ── STRING_AGG ────────────────────────────────────────────────────────────
await t('string_agg',
    `select string_agg(Name, ', ') within group (order by Name) from dbo.Tags;`,
    ['string_agg', 'within group', 'order by Name']);

// ── OPENJSON ──────────────────────────────────────────────────────────────
await t('openjson',
    `select * from openjson(@json) with (Id int '$.id', Name nvarchar(100) '$.name');`,
    ['openjson', "'$.id'", "'$.name'"]);

// ── OPENROWSET ────────────────────────────────────────────────────────────
await t('openrowset',
    `select * from openrowset('SQLNCLI', 'Server=srv;Trusted_Connection=yes;', 'select 1');`,
    ['openrowset', "'SQLNCLI'"]);

// ── AT TIME ZONE ──────────────────────────────────────────────────────────
await t('at_time_zone',
    `select getdate() at time zone 'UTC' at time zone 'Eastern Standard Time';`,
    ['at time zone', "'UTC'", "'Eastern Standard Time'"]);

// ── TRY_CONVERT / TRY_CAST ────────────────────────────────────────────────
await t('try_convert',
    `select try_convert(int, '123abc');`,
    ['try_convert', "'123abc'"]);

await t('try_cast',
    `select try_cast('abc' as int);`,
    ['try_cast', "'abc'", 'as int']);

// ── PARSE / TRY_PARSE ─────────────────────────────────────────────────────
await t('parse_function',
    `select parse('01/01/2024' as date using 'en-US');`,
    ['parse', 'as date', "'en-US'"]);

console.log(`\n${ok} passed, ${fail} failed`);
