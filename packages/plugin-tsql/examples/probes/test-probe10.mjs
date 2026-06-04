/**
 * Tenth probe — output clauses, complex DML patterns, and idempotency checks.
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

// Idempotency test: format output should be stable when re-formatted
async function idem(name, sql) {
    let out1, out2;
    try {
        out1 = await fmt(sql);
        out2 = await fmt(out1);
    } catch (e) { console.log(`FAIL [${name}] ERROR: ${e.message}`); fail++; return; }
    if (out1 !== out2) {
        console.log(`FAIL [${name}] NOT IDEMPOTENT`);
        // Show diff lines
        const l1 = out1.split('\n'), l2 = out2.split('\n');
        for (let i = 0; i < Math.max(l1.length, l2.length); i++) {
            if (l1[i] !== l2[i]) console.log(`  line ${i+1}: '${l1[i]}' vs '${l2[i]}'`);
        }
        fail++;
    } else ok++;
}

// ── Idempotency: major constructs ─────────────────────────────────────────
await idem('idem_select',
    `select o.Id, c.Name, sum(o.Amount) as Total from dbo.Orders o join dbo.Customers c on o.CustId = c.Id group by o.Id, c.Name having sum(o.Amount) > 100 order by Total desc;`);

await idem('idem_insert_select',
    `insert into dbo.Archive (Id, Name, ArchivedAt) select Id, Name, getdate() from dbo.Products where IsObsolete = 1;`);

await idem('idem_update',
    `update o set o.Status = 'Expired' from dbo.Orders o join dbo.Customers c on o.CustId = c.Id where c.IsActive = 0 and o.OrderDate < dateadd(year, -1, getdate());`);

await idem('idem_merge',
    `merge dbo.Target as t using dbo.Source as s on t.Id = s.Id when matched then update set t.Name = s.Name when not matched by target then insert (Id, Name) values (s.Id, s.Name) when not matched by source then delete;`);

await idem('idem_create_table',
    `create table dbo.Orders (Id int not null, CustId int not null, Amount decimal(10,2) not null, OrderDate date not null default getdate(), constraint PK_Orders primary key clustered (Id), constraint FK_Orders_Cust foreign key (CustId) references dbo.Customers (Id) on delete cascade);`);

await idem('idem_cte',
    `with ActiveOrders as (select Id, CustId, Amount from dbo.Orders where IsActive = 1), CustomerTotals as (select CustId, sum(Amount) as Total from ActiveOrders group by CustId) select c.Name, ct.Total from dbo.Customers c join CustomerTotals ct on c.Id = ct.CustId order by ct.Total desc;`);

await idem('idem_proc',
    `create procedure dbo.usp_GetOrders @CustId int, @StartDate date = null as begin select Id, Amount, OrderDate from dbo.Orders where CustId = @CustId and (@StartDate is null or OrderDate >= @StartDate) order by OrderDate desc; end;`);

await idem('idem_window',
    `select Id, Amount, row_number() over (partition by CustId order by OrderDate desc) as rn, sum(Amount) over (partition by CustId) as CustTotal from dbo.Orders;`);

// ── OUTPUT INTO from CTE ───────────────────────────────────────────────────
await t('cte_delete_output',
    `with OldRows as (
        select top (100) Id from dbo.Log
        order by CreatedAt asc
     )
     delete from OldRows
     output deleted.Id into @DeletedIds;`,
    ['with OldRows as', 'delete from OldRows', 'output deleted.Id', 'into @DeletedIds']);

// ── OUTPUT INSERTED.* ─────────────────────────────────────────────────────
await t('insert_output_all',
    `insert into dbo.T (Name) output inserted.* values ('test');`,
    ['output inserted.*']);

// ── Sequence as default ───────────────────────────────────────────────────
await t('seq_as_default',
    `create table dbo.T (
        Id int not null default (next value for dbo.MySeq),
        Name nvarchar(100)
     );`,
    ['default (next value for dbo.MySeq)']);

// ── Column with multiple constraints (no name conflict) ───────────────────
await t('multi_constraint_col',
    `create table dbo.T (
        Id int not null,
        Code nvarchar(20) not null unique,
        constraint UQ_Code unique (Code)
     );`,
    ['nvarchar(20) not null unique', 'constraint UQ_Code unique (Code)']);

// ── Nullable ROWGUIDCOL ───────────────────────────────────────────────────
await t('rowguidcol_col',
    `create table dbo.T (
        RowGuid uniqueidentifier rowguidcol default newsequentialid() not null
     );`,
    ['rowguidcol', 'default newsequentialid()', 'uniqueidentifier']);

// ── EXEC return value ─────────────────────────────────────────────────────
await t('exec_return_value',
    `declare @rc int;
     exec @rc = dbo.usp_Check @Id = 1;
     select @rc;`,
    // formatter expands exec → execute; check return-value capture and args
    ['@rc = dbo.usp_Check', '@Id = 1', 'select @rc']);

// ── Correlated subquery in SELECT ────────────────────────────────────────
await t('correlated_subquery',
    `select Id, (select count(*) from dbo.OrderLines ol where ol.OrderId = o.Id) as LineCount from dbo.Orders o;`,
    ['count(*)', 'ol.OrderId = o.Id', 'LineCount']);

// ── Multiple UNION queries ────────────────────────────────────────────────
await t('multi_union',
    `select 'active' as Status, count(*) as Cnt from dbo.Orders where IsActive = 1
     union all
     select 'inactive', count(*) from dbo.Orders where IsActive = 0
     union all
     select 'pending', count(*) from dbo.Orders where Status = 'pending';`,
    ['union all', "'active'", "'inactive'", "'pending'"]);

// ── CROSS APPLY with scalar TVF ───────────────────────────────────────────
await t('cross_apply_tvf',
    `select o.Id, v.Tax
     from dbo.Orders o
     cross apply dbo.fn_CalcTax(o.Amount, o.Region) as v;`,
    ['cross apply', 'dbo.fn_CalcTax', 'o.Amount, o.Region']);

// ── JOIN ON with complex predicate ────────────────────────────────────────
await t('join_complex_on',
    `select * from dbo.A a
     join dbo.B b on a.Id = b.AId and b.IsActive = 1 and b.Type in ('X', 'Y');`,
    ["b.IsActive = 1", "b.Type in ('X', 'Y')"]);

// ── Nested CTE ────────────────────────────────────────────────────────────
await t('nested_aggregate',
    `select Region, avg(TotalAmount) as AvgTotal
     from (
         select CustId, Region, sum(Amount) as TotalAmount
         from dbo.Orders
         group by CustId, Region
     ) as CustTotals
     group by Region;`,
    ['avg(TotalAmount)', 'AvgTotal', 'TotalAmount']);

// ── INSERT ... SELECT with ORDER BY (in sub-SELECT, not INSERT) ───────────
await t('insert_ordered_select',
    `insert into dbo.Archive (Id, Amount)
     select top (1000) Id, Amount
     from dbo.Orders
     order by CreatedAt asc;`,
    ['insert into dbo.Archive', 'top (1000)', 'order by CreatedAt asc']);

// ── EXECUTE with return value capture ─────────────────────────────────────
await t('exec_capture',
    `declare @status int = 0;
     exec @status = sp_rename 'dbo.OldTable', 'NewTable', 'OBJECT';
     if @status <> 0 raiserror('Rename failed', 16, 1);`,
    // formatter expands exec → execute; check return-value capture, args, and if
    ["@status = sp_rename", "'OBJECT'", 'if @status <> 0']);

// ── Multiple table hints ──────────────────────────────────────────────────
await t('multiple_table_hints',
    `select * from dbo.Orders with (nolock, index(IX_Orders_CustId)) where CustId = @id;`,
    ['with (nolock', 'index', 'IX_Orders_CustId']);

// ── FORCESEEK with index and columns ─────────────────────────────────────
await t('forceseek_full',
    `select * from dbo.Orders with (forceseek(IX_Orders_Cust (CustId, OrderDate))) where CustId = 1;`,
    // formatter may omit space between index name and col list — check semantics only
    ['forceseek(IX_Orders_Cust', 'CustId, OrderDate']);

// ── Complex WHERE with boolean logic ─────────────────────────────────────
await t('complex_where',
    `select * from dbo.T
     where (A = 1 or B = 2) and (C = 3 or D = 4) and not (E is null and F is null);`,
    // formatter adds spaces inside parens when multi-line — check content, not layout
    ['A = 1 or B = 2', 'C = 3 or D = 4', 'not', 'E is null and F is null']);

// ── CAST to xml ───────────────────────────────────────────────────────────
await t('cast_to_xml',
    `select cast('<root><item id="1"/></root>' as xml);`,
    ['cast(', 'as xml']);

// ── DROP IF EXISTS (various objects) ─────────────────────────────────────
await t('drop_if_exists_proc',
    `drop procedure if exists dbo.usp_Test, dbo.usp_Other;`,
    ['drop procedure if exists', 'dbo.usp_Test', 'dbo.usp_Other']);

await t('drop_if_exists_view',
    `drop view if exists dbo.vActiveOrders;`,
    ['drop view if exists', 'dbo.vActiveOrders']);

await t('drop_if_exists_fn',
    `drop function if exists dbo.fn_GetPrice;`,
    ['drop function if exists', 'dbo.fn_GetPrice']);

console.log(`\n${ok} passed, ${fail} failed`);
