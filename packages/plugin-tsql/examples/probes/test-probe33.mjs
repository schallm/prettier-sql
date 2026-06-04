/**
 * Probe 33 — Final targeted checks:
 *   - DROP CLUSTERED CONSTRAINT WITH (WAIT_AT_LOW_PRIORITY)
 *   - ALTER INDEX REBUILD WITH (WAIT_AT_LOW_PRIORITY)
 *   - ONLINE index rebuild (already known but let's recheck)
 *   - CREATE INDEX WITH fill factor, pad_index, etc.
 *   - Procedure parameter attributes (VARYING, READONLY)
 *   - Rare but valid: multiple EXEC AS options in proc
 *   - Trigger with multiple events (INSERT, UPDATE, DELETE)
 *   - SELECT without FROM (system function queries)
 *   - GOTO and label roundtrip
 *   - WHILE with complex body
 *   - BEGIN/END in IF without ELSE
 *   - Nested BEGIN/END blocks
 *   - Complex CASE in ORDER BY / GROUP BY
 *   - OVER with ROWS BETWEEN
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
    // ── DROP CLUSTERED CONSTRAINT WITH WAIT ───────────────────────────────────
    check(
        'drop_pk_wait_at_low_priority',
        `alter table dbo.Orders drop constraint PK_Orders with (online = on, wait_at_low_priority (max_duration = 5 minutes, abort_after_wait = self))`,
        ['drop', 'constraint', 'pk_orders', 'with', 'online', 'on', 'wait_at_low_priority', 'max_duration', '5', 'abort_after_wait', 'self']
    ),

    // ── ALTER INDEX REBUILD WITH ONLINE + WAIT_AT_LOW_PRIORITY ────────────────
    check(
        'alter_index_rebuild_wait',
        `alter index IX_Orders_Date on dbo.Orders rebuild with (online = on (wait_at_low_priority (max_duration = 10 minutes, abort_after_wait = blockers)))`,
        ['alter', 'index', 'rebuild', 'with', 'online', 'on', 'wait_at_low_priority', 'max_duration', '10', 'blockers']
    ),

    // ── CREATE INDEX with multiple WITH options ────────────────────────────────
    check(
        'create_index_with_options',
        `create index IX_Orders_Cust on dbo.Orders (CustomerId, OrderDate desc) with (pad_index = on, fillfactor = 80, sort_in_tempdb = on, online = off)`,
        ['pad_index', 'on', 'fillfactor', '80', 'sort_in_tempdb', 'online', 'off']
    ),

    // ── Trigger with INSERT + UPDATE + DELETE ──────────────────────────────────
    check(
        'trigger_all_dml_events',
        `create trigger trgAudit on dbo.Orders after insert, update, delete as begin print 'Changed' end`,
        ['create', 'trigger', 'after', 'insert', 'update', 'delete', 'as', 'begin', 'changed']
    ),

    // ── SELECT without FROM ───────────────────────────────────────────────────
    check(
        'select_no_from',
        `select getdate(), @@servername, newid(), 1 + 1 as Result`,
        ['select', 'getdate', '@@servername', 'newid', 'result']
    ),

    // ── GOTO and label ────────────────────────────────────────────────────────
    check(
        'goto_label',
        `begin tran begin try insert into dbo.T values (1) commit end try begin catch rollback goto ErrorHandler end catch return ErrorHandler: raiserror ('Error occurred', 16, 1)`,
        ['goto', 'errorhandler', 'errorhandler:', 'raiserror']
    ),

    // ── WHILE with nested control flow ────────────────────────────────────────
    check(
        'while_with_nested',
        `declare @i int = 1 while @i <= 10 begin if @i % 2 = 0 begin print cast(@i as varchar) end set @i = @i + 1 end`,
        ['while', '@i', '<=', '10', 'begin', 'if', '@i', '%', '2', '=', '0', 'print', 'cast', '@i', 'end']
    ),

    // ── Complex CASE in ORDER BY ───────────────────────────────────────────────
    check(
        'case_in_order_by',
        `select * from dbo.Orders order by case Status when 'Urgent' then 1 when 'High' then 2 else 3 end, OrderDate desc`,
        ['order by', 'case', 'status', 'urgent', '1', 'high', '2', 'else', '3', 'end', 'orderdate', 'desc']
    ),

    // ── OVER with ROWS BETWEEN ─────────────────────────────────────────────────
    check(
        'rows_between_preceding',
        `select sum(Amount) over (partition by CustomerId order by OrderDate rows between 3 preceding and current row) from dbo.Orders`,
        ['sum(amount)', 'over', 'partition', 'by', 'customerid', 'order by', 'rows', 'between', '3', 'preceding', 'current', 'row']
    ),
    check(
        'rows_between_following',
        `select avg(Amount) over (order by OrderDate rows between current row and 2 following) from dbo.Orders`,
        ['rows', 'between', 'current', 'row', 'and', '2', 'following']
    ),

    // ── GROUP BY with HAVING ───────────────────────────────────────────────────
    check(
        'group_having',
        `select CustomerId, count(*) as OrderCount, sum(Amount) as Total from dbo.Orders group by CustomerId having count(*) > 5 and sum(Amount) > 1000`,
        ['group', 'by', 'customerid', 'having', 'count(*)', '>', '5', 'sum(amount)', '>', '1000']
    ),

    // ── Stored proc with multiple result sets ──────────────────────────────────
    check(
        'proc_multiple_selects',
        `create procedure dbo.GetSummary as select count(*) as Total from dbo.Orders; select top 10 OrderId, Amount from dbo.Orders order by Amount desc`,
        ['create', 'procedure', 'dbo.getsummary', 'as', 'count(*)', 'top', '10', 'orderid', 'amount', 'order by']
    ),

    // ── sp_executesql with named params ───────────────────────────────────────
    check(
        'sp_executesql_named',
        `exec sp_executesql N'select @Total = sum(Amount) from dbo.Orders where CustomerId = @Id', N'@Id int, @Total decimal(12,2) output', @Id = @customerId, @Total = @result output`,
        ['sp_executesql', '@total', 'sum(amount)', '@id', 'output', '@customerid', '@result']
    ),

    // ── MERGE with complex match conditions ────────────────────────────────────
    check(
        'merge_complex',
        `merge dbo.Inventory t using (select ProductId, sum(Qty) as TotalQty from dbo.Sales group by ProductId) s on t.ProductId = s.ProductId when matched and t.OnHand < s.TotalQty then update set t.NeedsReorder = 1 when matched then update set t.LastSaleDate = getdate() when not matched by target then insert (ProductId, OnHand) values (s.ProductId, 0) when not matched by source then delete;`,
        ['merge', 'when', 'matched', 'and', 't.onhand', '<', 's.totalqty', 'when', 'matched', 'when', 'not', 'matched', 'by', 'target', 'insert', 'when', 'not', 'matched', 'by', 'source', 'delete']
    ),

    // ── INSERT with subquery (not values/select) ───────────────────────────────
    check(
        'insert_exec_resultset',
        `insert into #Results (Col1, Col2) exec dbo.GetData @param = 1`,
        ['insert', 'into', '#results', 'col1', 'col2', 'exec', 'dbo.getdata', '@param']
    ),

    // ── CONVERT between types with style ──────────────────────────────────────
    check(
        'parse_call',
        `select parse('20240101' as date using 'en-US')`,
        ['parse', '20240101', 'as', 'date', 'using', 'en-us']
    ),
    check(
        'try_parse',
        `select try_parse('abc' as int using 'en-US')`,
        ['try_parse', 'abc', 'as', 'int', 'using', 'en-us']
    ),

    // ── Quoted identifiers with special characters ─────────────────────────────
    check(
        'quoted_identifiers',
        `select [Order ID], [Customer Name], [Total Amount] from [dbo].[My Orders] where [Order ID] = 1`,
        ['[order id]', '[customer name]', '[total amount]', '[dbo]', '[my orders]']
    ),

    // ── CREATE TABLE with multiple unique constraints ──────────────────────────
    check(
        'multiple_unique_constraints',
        `create table dbo.Products (Id int not null primary key, SKU nvarchar(50) not null, Barcode nvarchar(30) null, constraint UQ_SKU unique (SKU), constraint UQ_Barcode unique (Barcode) where Barcode is not null)`,
        ['uq_sku', 'unique', 'sku', 'uq_barcode', 'barcode', 'where', 'is not null']
    ),

    // ── NULL vs NOT NULL explicitly ───────────────────────────────────────────
    check(
        'null_not_null_explicit',
        `create table dbo.T (A int not null, B int null, C int)`,
        ['a', 'int', 'not null', 'b', 'int', 'null', 'c', 'int']
    ),

    // ── Subquery in WHERE with NOT IN ─────────────────────────────────────────
    check(
        'not_in_subquery',
        `select * from dbo.Customers where CustomerId not in (select CustomerId from dbo.Blacklist)`,
        ['not', 'in', 'select', 'customerid', 'from', 'dbo.blacklist']
    ),

    // ── LIKE patterns ─────────────────────────────────────────────────────────
    check(
        'like_patterns',
        `select * from dbo.Products where Name like '%Widget%' and SKU not like 'X[0-9]%' escape '!'`,
        ['like', '%widget%', 'not', 'like', 'x[0-9]%', 'escape', "'!'"]
    ),

    // ── BETWEEN in WHERE ──────────────────────────────────────────────────────
    check(
        'between_where',
        `select * from dbo.Orders where Amount between 100 and 500 and OrderDate between '2024-01-01' and '2024-12-31'`,
        ['between', '100', 'and', '500', 'orderdate', 'between', '2024-01-01', '2024-12-31']
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

console.log(`\nProbe 33 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
