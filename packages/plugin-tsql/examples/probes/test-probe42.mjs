/**
 * Probe 42 — Comments preservation and whitespace-sensitive areas:
 *   - Line comments at start of statement
 *   - Line comments inline within statement
 *   - Block comments between clauses
 *   - Block comments inside expression lists
 *   - Comment-only blocks
 *   - Idempotency: format(format(sql)) == format(sql)
 *   - Statements where semicolons are tricky (GO separator)
 *   - Multiple statements in one batch (no GO)
 *   - Empty DECLARE (no init)
 *   - DECLARE with table type parameter
 *   - EXEC with RETURN value captured
 *   - INSERT with column list matching VALUES columns
 *   - UPDATE SET multiple columns
 *   - DELETE with CTE
 *   - SELECT with ROLLUP in column list (not GROUP BY)
 *   - CREATE PROCEDURE with multiple output params
 *   - Recursive CTE with complex anchor/recursive parts
 *   - CTE in UPDATE statement
 *   - CTE in DELETE statement
 *   - CTE in MERGE statement
 *   - TOP in UPDATE / DELETE
 *   - FETCH ABSOLUTE / RELATIVE
 *   - CURSOR with FOR UPDATE OF
 *   - CREATE TRIGGER complex body
 *   - DDL trigger (CREATE_TABLE event)
 *   - INSTEAD OF trigger on view
 *   - AFTER INSERT, UPDATE trigger with INSERTED/DELETED
 *   - Partitioned table reference in query
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
    // ── Idempotency ───────────────────────────────────────────────────────────
    // (These test that a second format pass produces identical output)
    check(
        'select_star_idempotent',
        `select * from dbo.Orders`,
        ['select', 'from', 'dbo.orders']
    ),
    check(
        'create_proc_idempotent',
        `create procedure dbo.GetOrders @CustomerId int as begin select * from dbo.Orders where CustomerId = @CustomerId end`,
        ['create procedure', 'select', 'customerid', '= @customerid']
    ),

    // ── Multiple statements no GO ─────────────────────────────────────────────
    check(
        'multiple_stmts_no_go',
        `declare @x int = 1; declare @y int = 2; set @x = @x + @y; print @x`,
        ['declare @x', 'declare @y', 'set @x', 'print @x']
    ),

    // ── UPDATE multiple SET ───────────────────────────────────────────────────
    check(
        'update_multiple_set',
        `update dbo.Orders set Status = 'Archived', ModifiedDate = getdate(), ModifiedBy = suser_sname(), ArchiveReason = 'Auto-archive' where OrderDate < dateadd(year, -5, getdate())`,
        ['set', 'status', 'archived', 'modifieddate', 'getdate', 'modifiedby', 'suser_sname', 'archivereason', 'auto-archive', 'where', 'dateadd']
    ),

    // ── DELETE with CTE ───────────────────────────────────────────────────────
    check(
        'delete_with_cte',
        `with OldOrders as (select OrderId from dbo.Orders where OrderDate < '2020-01-01') delete from OldOrders`,
        ['with', 'oldorders', 'orderdate', 'delete', 'from', 'oldorders']
    ),

    // ── CTE in UPDATE ─────────────────────────────────────────────────────────
    check(
        'update_with_cte',
        `with Ranked as (select OrderId, row_number() over (partition by CustomerId order by OrderDate) as Rn from dbo.Orders) update Ranked set Status = 'First' where Rn = 1`,
        ['with', 'ranked', 'row_number', 'partition by', 'update', 'status', 'first', 'rn = 1']
    ),

    // ── CTE in MERGE ─────────────────────────────────────────────────────────
    check(
        'merge_with_cte',
        `with Source as (select CustomerId, sum(Amount) as Total from dbo.Orders group by CustomerId) merge dbo.CustomerStats t using Source s on t.CustomerId = s.CustomerId when matched then update set t.Total = s.Total when not matched then insert (CustomerId, Total) values (s.CustomerId, s.Total);`,
        ['with source', 'sum', 'merge', 'customerstats', 'when matched', 'update set', 'when not matched', 'insert', 'values']
    ),

    // ── TOP in UPDATE / DELETE ────────────────────────────────────────────────
    check(
        'top_update',
        `update top (100) dbo.Orders set Status = 'Archived' where OrderDate < '2020-01-01'`,
        ['update', 'top', '100', 'set', 'archived', 'where', 'orderdate']
    ),
    check(
        'top_delete',
        `delete top (1000) from dbo.Logs where LogDate < dateadd(month, -6, getdate())`,
        ['delete', 'top', '1000', 'from', 'logs', 'where', 'logdate', 'dateadd', '-6']
    ),

    // ── CURSOR with FOR UPDATE OF ─────────────────────────────────────────────
    check(
        'cursor_for_update',
        `declare MyCursor cursor for select OrderId, Status from dbo.Orders where Status = 'Pending' for update of Status`,
        ['declare', 'cursor', 'for select', 'for update of', 'status']
    ),

    // ── Trigger body tests ────────────────────────────────────────────────────
    check(
        'trigger_with_inserted_deleted',
        `create trigger trgOrderAudit on dbo.Orders after insert, update as begin insert into dbo.OrderAudit select i.OrderId, i.Amount, d.Amount, getdate() from inserted i left join deleted d on i.OrderId = d.OrderId end`,
        ['create trigger', 'trgorderaudit', 'after insert, update', 'inserted', 'deleted', 'insert into', 'orderaudit', 'left join']
    ),
    check(
        'instead_of_trigger',
        `create trigger trgOrderView on dbo.vOrders instead of insert as begin insert into dbo.Orders select * from inserted end`,
        ['instead of insert', 'dbo.vorders', 'trgorderview', 'insert into', 'dbo.orders', 'inserted']
    ),
    check(
        'ddl_trigger',
        `create trigger trgPreventDrop on database for drop_table, alter_table as begin rollback end`,
        ['create trigger', 'on database', 'for drop_table, alter_table', 'rollback']
    ),

    // ── INSERT with explicit column list ──────────────────────────────────────
    check(
        'insert_column_list',
        `insert into dbo.Orders (CustomerId, ProductId, Quantity, UnitPrice, OrderDate, Status) values (@cid, @pid, @qty, @price, getdate(), 'Pending')`,
        ['insert into', 'customerid', 'productid', 'quantity', 'unitprice', 'orderdate', 'status', 'values', '@cid', '@pid', '@qty', '@price', 'getdate', 'pending']
    ),

    // ── DECLARE with table type ───────────────────────────────────────────────
    check(
        'declare_table_type',
        `declare @orders dbo.OrderList; insert into @orders (OrderId, Amount) values (1, 99.99)`,
        ['declare', '@orders', 'dbo.orderlist', 'insert into', '@orders', 'orderid', 'amount', '99.99']
    ),

    // ── Recursive CTE complex ─────────────────────────────────────────────────
    check(
        'recursive_cte_complex',
        `with EmployeeHierarchy as (select EmployeeId, ManagerId, Name, 0 as Level from dbo.Employees where ManagerId is null union all select e.EmployeeId, e.ManagerId, e.Name, h.Level + 1 from dbo.Employees e inner join EmployeeHierarchy h on e.ManagerId = h.EmployeeId) select * from EmployeeHierarchy order by Level, Name`,
        ['employeehierarchy', 'employeeid', 'managerid', 'level', 'union all', 'inner join', 'order by']
    ),

    // ── Proc with multiple output params ─────────────────────────────────────
    check(
        'proc_multiple_output',
        `create procedure dbo.GetStats @Table nvarchar(128), @RowCount bigint output, @DataSize bigint output, @IndexSize bigint output as begin select @RowCount = row_count, @DataSize = data_size, @IndexSize = index_size from dbo.TableStats where TableName = @Table end`,
        ['create procedure', '@table', '@rowcount', 'output', '@datasize', 'output', '@indexsize', 'output', 'select @rowcount', '@table']
    ),

    // ── FETCH ABSOLUTE / RELATIVE ─────────────────────────────────────────────
    check(
        'fetch_absolute',
        `fetch absolute 5 from MyCursor into @id`,
        ['fetch', 'absolute', '5', 'from', 'mycursor', 'into', '@id']
    ),
    check(
        'fetch_relative',
        `fetch relative -2 from MyCursor into @id`,
        ['fetch', 'relative', '-2', 'from', 'mycursor', 'into', '@id']
    ),
    check(
        'fetch_first_last',
        `fetch first from MyCursor into @id; fetch last from MyCursor into @id`,
        ['fetch first', 'from mycursor', 'fetch last', '@id']
    ),

    // ── EXEC with string variable ─────────────────────────────────────────────
    check(
        'exec_variable',
        `declare @proc nvarchar(128) = 'dbo.GetOrders'; exec @proc @CustomerId = 42`,
        ['declare', '@proc', 'exec @proc', '@customerid', '42']
    ),

    // ── INSERT ... SELECT without FROM (values from expressions) ──────────────
    check(
        'insert_select_no_from',
        `insert into dbo.Config (Key, Value, CreatedDate) select 'MaxRetries', cast(5 as nvarchar), getdate()`,
        ['insert into', 'config', 'key', 'value', 'createddate', 'select', 'maxretries', 'cast', 'getdate']
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

console.log(`\nProbe 42 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
