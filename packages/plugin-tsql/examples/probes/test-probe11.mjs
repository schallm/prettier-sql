/**
 * Eleventh probe — multi-statement TVFs, OUTPUT params, SELECT INTO,
 * PIVOT/UNPIVOT, MERGE with conditions, Service Broker, and other
 * constructs not yet covered.
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

// ── Multi-statement TVF (RETURNS @t TABLE) ───────────────────────────────
await t('mstvf_basic',
    `create function dbo.fn_GetOrders(@CustId int)
     returns @result table (
         Id int not null,
         Amount decimal(10,2),
         OrderDate date
     )
     as
     begin
         insert @result
         select Id, Amount, OrderDate
         from dbo.Orders
         where CustId = @CustId and IsActive = 1;

         update @result set Amount = Amount * 1.1 where OrderDate < '2023-01-01';

         return;
     end;`,
    // formatter adds INTO and spaces inside decimal(...)
    ['returns @result table', 'Id int not null', 'Amount decimal(10',
     'insert', '@result', 'update @result', 'return']);

// ── Multi-statement TVF with complex body ─────────────────────────────────
await t('mstvf_complex',
    `create function dbo.fn_Split(@str nvarchar(max), @sep nvarchar(10))
     returns @parts table (Pos int identity(1,1), Val nvarchar(max))
     as
     begin
         declare @i int = 1, @len int = len(@str);
         while @i <= @len
         begin
             insert @parts (Val) values (substring(@str, @i, charindex(@sep, @str + @sep, @i) - @i));
             set @i = charindex(@sep, @str + @sep, @i) + len(@sep);
         end;
         return;
     end;`,
    // formatter adds INTO; identity(1,1) → identity(1, 1) with space
    ['returns @parts table', 'identity(1', 'while @i <= @len',
     'insert', '@parts', 'charindex(@sep', 'return']);

// ── OUTPUT parameter in EXEC ──────────────────────────────────────────────
await t('exec_output_param',
    `declare @result int;
     exec dbo.usp_GetStatus @Id = 1, @Status = @result output;
     select @result;`,
    ['@Status = @result output', 'select @result']);

// ── OUTPUT param by position ──────────────────────────────────────────────
await t('exec_output_positional',
    `declare @total decimal(10,2);
     exec dbo.usp_CalcTotal 42, @total output;
     print @total;`,
    ['@total output', 'print @total']);

// ── SELECT INTO (create table from query) ─────────────────────────────────
await t('select_into',
    `select Id, Name, getdate() as ArchivedAt
     into dbo.Archived
     from dbo.Products
     where IsObsolete = 1;`,
    ['select', 'into dbo.Archived', 'from dbo.Products', 'IsObsolete = 1']);

// ── SELECT INTO #temp ─────────────────────────────────────────────────────
await t('select_into_temp',
    `select o.Id, o.Amount, c.Name as CustName
     into #TempOrders
     from dbo.Orders o
     join dbo.Customers c on o.CustId = c.Id
     where o.IsActive = 1;`,
    // formatter expands join → inner join and adds AS; check semantics
    ['into #TempOrders', 'dbo.Customers', 'o.CustId = c.Id', 'CustName']);

// ── PIVOT ──────────────────────────────────────────────────────────────────
await t('pivot_basic',
    `select * from (
         select Region, Product, Amount from dbo.Sales
     ) as src
     pivot (
         sum(Amount) for Product in ([Widget], [Gadget], [Doohickey])
     ) as pvt;`,
    ['pivot', 'sum(Amount)', 'for Product in', '[Widget]', '[Gadget]', '[Doohickey]']);

// ── UNPIVOT ────────────────────────────────────────────────────────────────
await t('unpivot_basic',
    `select Region, Quarter, Revenue
     from dbo.QuarterlySales
     unpivot (
         Revenue for Quarter in (Q1, Q2, Q3, Q4)
     ) as unpvt;`,
    ['unpivot', 'Revenue for Quarter in', 'Q1', 'Q4']);

// ── MERGE with WHEN MATCHED AND condition ─────────────────────────────────
await t('merge_when_and',
    `merge dbo.Inventory as t
     using dbo.Updates as s on t.ProductId = s.ProductId
     when matched and t.Qty <> s.Qty
         then update set t.Qty = s.Qty, t.LastUpdated = getdate()
     when matched and s.Qty = 0
         then delete
     when not matched by target
         then insert (ProductId, Qty) values (s.ProductId, s.Qty);`,
    ['when matched and t.Qty <> s.Qty',
     'when matched and s.Qty = 0',
     'then delete',
     'when not matched by target']);

// ── MERGE with OUTPUT ─────────────────────────────────────────────────────
await t('merge_output',
    `merge dbo.Target as t
     using dbo.Source as s on t.Id = s.Id
     when not matched then insert (Id, Val) values (s.Id, s.Val)
     output $action, inserted.Id, deleted.Id into @MergeLog;`,
    ['$action', 'inserted.Id', 'deleted.Id', 'into @MergeLog']);

// ── Service Broker: CREATE MESSAGE TYPE ──────────────────────────────────
await t('create_message_type',
    `create message type [//orders/NewOrder]
     validation = well_formed_xml;`,
    ['create message type', '//orders/NewOrder', 'well_formed_xml']);

// ── Service Broker: CREATE CONTRACT ───────────────────────────────────────
await t('create_contract',
    `create contract [//orders/OrderContract]
     ([//orders/NewOrder] sent by initiator,
      [//orders/OrderConfirm] sent by target);`,
    ['create contract', '//orders/OrderContract', 'sent by initiator', 'sent by target']);

// ── Service Broker: CREATE QUEUE ──────────────────────────────────────────
await t('create_queue',
    `create queue dbo.OrderQueue
     with status = on, retention = off;`,
    ['create queue dbo.OrderQueue', 'status = on', 'retention = off']);

// ── Service Broker: SEND ON CONVERSATION ─────────────────────────────────
await t('send_on_conversation',
    `send on conversation @handle
     message type [//orders/NewOrder]
     (@OrderData);`,
    ['send on conversation', '//orders/NewOrder']);

// ── Service Broker: RECEIVE ────────────────────────────────────────────────
await t('receive_stmt',
    `receive top (1)
         conversation_handle, message_type_name, message_body
     from dbo.OrderQueue
     into @msgTable;`,
    ['receive', 'conversation_handle', 'message_body', 'from dbo.OrderQueue']);

// ── Service Broker: END CONVERSATION ──────────────────────────────────────
await t('end_conversation',
    `end conversation @handle with cleanup;`,
    ['end conversation', 'with cleanup']);

// ── XACT_STATE error handling ─────────────────────────────────────────────
await t('xact_state_pattern',
    `begin try
         begin transaction;
         insert into dbo.T values (1);
         commit transaction;
     end try
     begin catch
         if xact_state() = -1
             rollback transaction;
         else if xact_state() = 1
             commit transaction;
         throw;
     end catch;`,
    ['begin try', 'begin transaction', 'begin catch',
     'xact_state() = -1', 'rollback transaction',
     'xact_state() = 1', 'commit transaction', 'throw']);

// ── THROW with variables ──────────────────────────────────────────────────
await t('throw_with_vars',
    `declare @msg nvarchar(2048) = 'Record ' + cast(@Id as nvarchar) + ' not found';
     throw 50001, @msg, 1;`,
    ["throw 50001, @msg, 1"]);

// ── RAISERROR with all args ───────────────────────────────────────────────
await t('raiserror_full',
    `raiserror('Custom error %s in table %s', 16, 1, @TableName, 'Orders') with nowait, log;`,
    // formatter adds space: raiserror (...); option order may vary
    ["raiserror", "'Custom error %s", 'nowait', 'log']);

// ── String functions: CONCAT_WS ───────────────────────────────────────────
await t('concat_ws',
    `select concat_ws(', ', FirstName, MiddleName, LastName) as FullName from dbo.People;`,
    ["concat_ws(', '", 'FirstName', 'MiddleName', 'LastName']);

// ── String functions: TRANSLATE ───────────────────────────────────────────
await t('translate_fn',
    `select translate(Code, 'ABC', '123') from dbo.T;`,
    ['translate(Code', "'ABC'", "'123'"]);

// ── String functions: TRIM ────────────────────────────────────────────────
await t('trim_fn',
    `select trim('  Hello  '), trim('x' from Code) from dbo.T;`,
    ["trim('  Hello  ')", "trim('x' from Code)"]);

// ── APPROX_COUNT_DISTINCT ──────────────────────────────────────────────────
await t('approx_count_distinct',
    `select approx_count_distinct(CustId) from dbo.Orders;`,
    ['approx_count_distinct(CustId)']);

// ── STRING_SPLIT in FROM ──────────────────────────────────────────────────
await t('string_split_from',
    `select value from string_split(@csv, ',') where value <> '';`,
    // 'value' is a reserved word — formatter brackets it as [value]; check semantics
    ['string_split(@csv', "','", "<> ''"]);

// ── PERCENTILE_CONT (window) ───────────────────────────────────────────────
await t('percentile_cont_within',
    `select percentile_cont(0.5) within group (order by Amount) over (partition by Region) as Median
     from dbo.Orders;`,
    ['percentile_cont(0.5)', 'within group', 'order by Amount', 'partition by Region']);

// ── CUME_DIST / PERCENT_RANK ──────────────────────────────────────────────
await t('cume_dist_percent_rank',
    `select Id, Amount,
         cume_dist() over (order by Amount) as CD,
         percent_rank() over (order by Amount) as PR
     from dbo.Orders;`,
    ['cume_dist()', 'percent_rank()', 'over (order by Amount']);

// ── EXECUTE AS clause in PROC definition ─────────────────────────────────
await t('proc_execute_as_self',
    `create procedure dbo.usp_DoWork
     with execute as self
     as begin select 1; end;`,
    ['execute as self']);

// ── REVERT ────────────────────────────────────────────────────────────────
await t('revert_stmt',
    `execute as user = 'AppUser';
     select user_name();
     revert;`,
    ["execute as user = 'AppUser'", 'revert']);

// ── ALTER DATABASE SET options ─────────────────────────────────────────────
await t('alter_db_set',
    `alter database MyDb set recovery full, page_verify checksum with no_wait;`,
    ['alter database MyDb', 'recovery full', 'page_verify checksum', 'no_wait']);

// ── CREATE AGGREGATE ──────────────────────────────────────────────────────
await t('create_aggregate',
    `create aggregate dbo.GeometricMean(@value float)
     returns float
     external name SqlAggregates.GeometricMean;`,
    ['create aggregate dbo.GeometricMean', 'returns float',
     'external name SqlAggregates.GeometricMean']);

// ── DROP AGGREGATE ────────────────────────────────────────────────────────
await t('drop_aggregate',
    `drop aggregate if exists dbo.GeometricMean;`,
    ['drop aggregate', 'dbo.GeometricMean']);

// ── OPENQUERY ─────────────────────────────────────────────────────────────
await t('openquery_select',
    `select * from openquery(LinkedServer, 'select Id, Name from RemoteDb.dbo.Products where IsActive = 1');`,
    ['openquery(LinkedServer', 'IsActive = 1']);

// ── sp_rename ─────────────────────────────────────────────────────────────
await t('sp_rename_col',
    `exec sp_rename 'dbo.Orders.OldCol', 'NewCol', 'COLUMN';`,
    ["'dbo.Orders.OldCol'", "'NewCol'", "'COLUMN'"]);

// ── CREATE INDEX with INCLUDE and FILTER ──────────────────────────────────
await t('index_include_filter',
    `create nonclustered index IX_Orders_Active
     on dbo.Orders (CustId, OrderDate)
     include (Amount, Status)
     where IsActive = 1
     with (fillfactor = 80, online = on);`,
    ['include (Amount, Status)', 'where IsActive = 1', 'fillfactor = 80', 'online = on']);

// ── CREATE INDEX: PAD_INDEX / SORT_IN_TEMPDB ──────────────────────────────
await t('index_all_options',
    `create unique nonclustered index UIX_Email
     on dbo.Users (Email)
     with (pad_index = on, sort_in_tempdb = on, drop_existing = on, online = on, maxdop = 4);`,
    ['unique nonclustered index UIX_Email', 'pad_index = on', 'sort_in_tempdb = on',
     'drop_existing = on', 'maxdop = 4']);

// ── DBCC SHRINKFILE ────────────────────────────────────────────────────────
await t('dbcc_shrinkfile',
    `dbcc shrinkfile (MyDb_log, 100) with no_infomsgs;`,
    ['dbcc shrinkfile', 'MyDb_log', '100', 'no_infomsgs']);

// ── DBCC CHECKCONSTRAINTS ─────────────────────────────────────────────────
await t('dbcc_checkconstraints',
    // DBCC CHECKCONSTRAINTS takes a table name (no schema prefix) or a string literal
    `dbcc checkconstraints ('dbo.Orders') with all_constraints;`,
    ['dbcc checkconstraints', 'dbo.Orders', 'all_constraints']);

console.log(`\n${ok} passed, ${fail} failed`);
