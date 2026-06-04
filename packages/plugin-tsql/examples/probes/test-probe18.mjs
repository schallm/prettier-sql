/**
 * Eighteenth probe — XML methods, JSON functions, TRY/CATCH error functions,
 * THROW, OUTPUT clause in INSERT, MERGE with OUTPUT, PIVOT, column aliases,
 * computed columns in views, indexed views, schema binding, columnstore indexes.
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

// ── XML methods ────────────────────────────────────────────────────────────
await t('xml_value',
    `select XmlCol.value('(/root/id)[1]', 'int') as Id from dbo.T;`,
    ["XmlCol.value('(/root/id)[1]'", "'int'"]);

await t('xml_query',
    `select XmlCol.query('/root/items/item') as Items from dbo.T;`,
    ["XmlCol.query('/root/items/item')"]);

await t('xml_nodes',
    `select r.value('@id', 'int'), r.value('@name', 'nvarchar(100)')
     from dbo.T
     cross apply XmlCol.nodes('/root/item') as x(r);`,
    ["XmlCol.nodes('/root/item')", "r.value('@id'", "r.value('@name'"]);

await t('xml_exist',
    `select Id from dbo.T where XmlCol.exist('/root[@active=1]') = 1;`,
    ["XmlCol.exist('/root[@active=1]')"]);

await t('xml_modify_insert',
    `update dbo.T set XmlCol.modify('insert <item id="1"/> as last into (/root)[1]')
     where Id = 42;`,
    ["XmlCol.modify('insert <item"]);

// ── JSON functions ────────────────────────────────────────────────────────
await t('json_value',
    `select json_value(JsonCol, '$.name') as Name from dbo.T;`,
    ["json_value(JsonCol, '$.name')"]);

await t('json_query',
    `select json_query(JsonCol, '$.items') as Items from dbo.T;`,
    ["json_query(JsonCol, '$.items')"]);

await t('json_modify',
    `update dbo.T set JsonCol = json_modify(JsonCol, '$.status', 'active') where Id = 1;`,
    ["json_modify(JsonCol, '$.status', 'active')"]);

await t('for_json_path',
    `select Id, Name from dbo.Orders for json path, root('Orders'), include_null_values;`,
    ['for json path', "root('Orders')", 'include_null_values']);

await t('for_json_auto',
    `select o.Id, c.Name from dbo.Orders o join dbo.Customers c on o.CustId = c.Id
     for json auto;`,
    ['for json auto']);

// ── TRY/CATCH error functions ──────────────────────────────────────────────
await t('error_functions',
    `begin try
         select 1/0;
     end try
     begin catch
         select error_number() as ErrNum,
                error_message() as ErrMsg,
                error_severity() as ErrSev,
                error_state() as ErrState,
                error_line() as ErrLine,
                error_procedure() as ErrProc;
     end catch;`,
    ['error_number()', 'error_message()', 'error_severity()',
     'error_state()', 'error_line()', 'error_procedure()']);

// ── THROW ──────────────────────────────────────────────────────────────────
await t('throw_stmt',
    `throw 50001, N'Custom error message', 1;`,
    ['throw 50001', "N'Custom error message'", '1']);

await t('throw_rethrow',
    `begin try select 1/0; end try begin catch throw; end catch;`,
    ['throw']);

// ── RAISERROR ─────────────────────────────────────────────────────────────
await t('raiserror_basic',
    `raiserror(N'Something went wrong: %s', 16, 1, @detail);`,
    ["raiserror", "N'Something went wrong", '16, 1', '@detail']);

await t('raiserror_with_log',
    `raiserror(50001, 16, 1) with log, nowait;`,
    ['raiserror', '50001', '16, 1', 'with log', 'nowait']);

// ── INSERT with OUTPUT ────────────────────────────────────────────────────
await t('insert_output',
    `insert into dbo.Orders (CustId, Amount)
     output inserted.Id, inserted.CustId into @NewOrders
     values (1, 99.99);`,
    ['output inserted.Id, inserted.CustId', 'into @NewOrders',
     "values (1, 99.99)"]);

// ── MERGE with OUTPUT ─────────────────────────────────────────────────────
await t('merge_output',
    `merge dbo.Target as t
     using dbo.Source as s on t.Id = s.Id
     when matched then update set t.Name = s.Name
     when not matched then insert (Id, Name) values (s.Id, s.Name)
     output $action, inserted.Id, deleted.Id into @MergeLog;`,
    ['output $action', 'inserted.Id', 'deleted.Id', 'into @MergeLog']);

// ── PIVOT ─────────────────────────────────────────────────────────────────
await t('pivot_query',
    `select * from (
         select CustId, Quarter, Amount from dbo.Sales
     ) as src
     pivot (sum(Amount) for Quarter in ([Q1],[Q2],[Q3],[Q4])) as pvt;`,
    ['pivot', 'sum(Amount)', 'for Quarter in', '[Q1]', '[Q4]']);

// ── CREATE VIEW with SCHEMABINDING ────────────────────────────────────────
await t('create_view_schemabinding',
    `create view dbo.vOrders
     with schemabinding
     as
     select o.Id, o.Amount, c.Name
     from dbo.Orders o
     join dbo.Customers c on o.CustId = c.Id;`,
    ['with schemabinding', 'dbo.vOrders']);

// ── CREATE UNIQUE CLUSTERED INDEX on view (indexed view) ──────────────────
await t('indexed_view_index',
    `create unique clustered index IX_vOrders
     on dbo.vOrders (Id);`,
    ['create unique clustered index IX_vOrders', 'on dbo.vOrders', 'Id']);

// ── Columnstore index ─────────────────────────────────────────────────────
await t('create_columnstore_index',
    `create nonclustered columnstore index IX_CS
     on dbo.Orders (CustId, OrderDate, Amount);`,
    ['columnstore index IX_CS', 'CustId, OrderDate, Amount']);

await t('create_clustered_columnstore',
    `create clustered columnstore index IX_CCS
     on dbo.BigFact;`,
    ['clustered columnstore index IX_CCS', 'dbo.BigFact']);

// ── DROP INDEX (table-qualified) ──────────────────────────────────────────
await t('drop_index_qualified',
    `drop index IX_Orders_CustId on dbo.Orders;`,
    ['drop index IX_Orders_CustId', 'on dbo.Orders']);

// ── ALTER TABLE ADD CONSTRAINT with FK ────────────────────────────────────
await t('add_fk_constraint',
    `alter table dbo.Orders
     add constraint FK_Orders_Customers
     foreign key (CustId) references dbo.Customers (Id)
     on delete cascade on update no action;`,
    ['foreign key (CustId)', 'references dbo.Customers (Id)',
     'on delete cascade', 'on update no action']);

// ── ALTER TABLE DROP CONSTRAINT ────────────────────────────────────────────
await t('drop_constraint',
    `alter table dbo.Orders drop constraint FK_Orders_Customers;`,
    ['drop constraint FK_Orders_Customers']);

// ── DISABLE TRIGGER / ENABLE TRIGGER ──────────────────────────────────────
await t('disable_trigger',
    `disable trigger trgAudit on dbo.Orders;`,
    ['disable trigger trgAudit', 'on dbo.Orders']);

await t('enable_trigger',
    `enable trigger all on database;`,
    ['enable trigger all', 'on database']);

// ── SELECT INTO (new table) ────────────────────────────────────────────────
await t('select_into_new',
    `select Id, Name, Amount * 1.1 as AdjustedAmount
     into dbo.OrdersBackup
     from dbo.Orders
     where IsActive = 1;`,
    ['into dbo.OrdersBackup', 'AdjustedAmount', 'IsActive = 1']);

// ── COMPUTED COLUMN in SELECT ──────────────────────────────────────────────
await t('computed_expr_select',
    `select
         Id,
         FirstName + ' ' + LastName as FullName,
         year(OrderDate) as OrderYear,
         datediff(day, OrderDate, getdate()) as DaysAgo
     from dbo.Orders;`,
    ["FirstName + ' ' + LastName as FullName",
     'year(OrderDate) as OrderYear',
     'datediff(day, OrderDate, getdate()) as DaysAgo']);

// ── GROUPING SETS ─────────────────────────────────────────────────────────
await t('grouping_sets',
    `select CustId, Region, sum(Amount) as Total
     from dbo.Orders
     group by grouping sets ((CustId, Region), (CustId), (Region), ());`,
    ['grouping sets', '(CustId, Region)', '(CustId)', '(Region)']);

// ── ROLLUP ────────────────────────────────────────────────────────────────
await t('rollup',
    `select Region, CustId, sum(Amount) as Total
     from dbo.Orders
     group by rollup(Region, CustId);`,
    ['rollup(Region, CustId)']);

// ── CUBE ──────────────────────────────────────────────────────────────────
await t('cube_grouping',
    `select Region, Product, sum(Amount) as Total
     from dbo.Sales
     group by cube(Region, Product);`,
    ['cube(Region, Product)']);

console.log(`\n${ok} passed, ${fail} failed`);
