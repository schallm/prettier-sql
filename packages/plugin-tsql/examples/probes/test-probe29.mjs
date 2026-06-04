/**
 * Probe 29 — Edge cases often seen in real SSMS-generated scripts:
 *   SET IDENTITY_INSERT, UPDATE STATISTICS, CREATE STATISTICS,
 *   sp_help / sp_helptext / sp_depends, EXEC with variable proc name,
 *   INSERT multi-row VALUES, CHECK CONSTRAINT WITH NOCHECK,
 *   columnstore indexes, filtered indexes, spatial types,
 *   computed column in index, CREATE TABLE with XML schema collection,
 *   EXECUTE AS clause in proc/func, WITH ENCRYPTION/RECOMPILE,
 *   INSTEAD OF trigger with multiple events
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
    // ── SET IDENTITY_INSERT ───────────────────────────────────────────────────
    check(
        'identity_insert_on',
        `set identity_insert dbo.Orders on`,
        ['set', 'identity_insert', 'dbo.orders', 'on']
    ),
    check(
        'identity_insert_off',
        `set identity_insert dbo.Orders off`,
        ['set', 'identity_insert', 'dbo.orders', 'off']
    ),

    // ── UPDATE STATISTICS ─────────────────────────────────────────────────────
    check(
        'update_statistics',
        `update statistics dbo.Orders`,
        ['update', 'statistics', 'dbo.orders']
    ),
    check(
        'update_statistics_index',
        `update statistics dbo.Orders IX_Orders_CustId with fullscan`,
        ['update', 'statistics', 'dbo.orders', 'ix_orders_custid', 'with', 'fullscan']
    ),
    check(
        'update_statistics_sample',
        `update statistics dbo.Orders with sample 30 percent`,
        ['update', 'statistics', 'with', 'sample', '30', 'percent']
    ),

    // ── CREATE STATISTICS ─────────────────────────────────────────────────────
    check(
        'create_statistics',
        `create statistics ST_Orders_Status on dbo.Orders (Status) with fullscan`,
        ['create', 'statistics', 'st_orders_status', 'on', 'dbo.orders', 'status', 'with', 'fullscan']
    ),

    // ── Columnstore indexes ────────────────────────────────────────────────────
    check(
        'create_columnstore_nonclustered',
        `create nonclustered columnstore index IX_CS_Orders on dbo.Orders (OrderId, CustomerId, Amount, OrderDate)`,
        ['nonclustered', 'columnstore', 'index', 'ix_cs_orders', 'dbo.orders', 'orderid', 'customerid', 'amount']
    ),
    check(
        'create_columnstore_clustered',
        `create clustered columnstore index IX_CCS_Orders on dbo.Orders`,
        ['clustered', 'columnstore', 'index', 'ix_ccs_orders']
    ),

    // ── EXECUTE AS in stored proc ─────────────────────────────────────────────
    check(
        'create_proc_execute_as',
        `create procedure dbo.SecureProc with execute as owner as select * from dbo.SecretTable`,
        ['with', 'execute', 'as', 'owner', 'select', 'secrettable']
    ),
    check(
        'create_proc_with_recompile',
        `create procedure dbo.GetOrders @CustomerId int with recompile as select * from dbo.Orders where CustomerId = @CustomerId`,
        ['with', 'recompile', 'select', 'orderid', '@customerid']
    ),
    check(
        'create_proc_with_encryption',
        `create procedure dbo.GetOrders @CustomerId int with encryption as select * from dbo.Orders where CustomerId = @CustomerId`,
        ['with', 'encryption']
    ),

    // ── WITH SCHEMABINDING ────────────────────────────────────────────────────
    check(
        'create_view_with_schemabinding',
        `create view dbo.ActiveOrders with schemabinding as select OrderId, CustomerId, OrderDate from dbo.Orders where Status = 'Active'`,
        ['with', 'schemabinding', 'select', 'orderid']
    ),
    check(
        'create_func_with_schemabinding',
        `create function dbo.GetPrice(@ProductId int) returns decimal(10,2) with schemabinding as begin return (select Price from dbo.Products where ProductId = @ProductId) end`,
        ['with', 'schemabinding', 'returns', 'decimal']
    ),

    // ── Multi-row INSERT VALUES ────────────────────────────────────────────────
    check(
        'insert_multi_row',
        `insert into dbo.Tags (OrderId, TagName) values (1, 'urgent'), (1, 'priority'), (2, 'standard'), (3, 'bulk')`,
        ['insert', 'into', 'dbo.tags', 'orderid', 'tagname', 'values', 'urgent', 'priority', 'standard', 'bulk']
    ),

    // ── NOCHECK re-enable constraint ──────────────────────────────────────────
    check(
        'check_nocheck_constraint',
        `alter table dbo.Orders nocheck constraint FK_Orders_Customer`,
        ['alter', 'table', 'dbo.orders', 'nocheck', 'constraint', 'fk_orders_customer']
    ),
    check(
        'check_constraint',
        `alter table dbo.Orders check constraint FK_Orders_Customer`,
        ['alter', 'table', 'dbo.orders', 'check', 'constraint', 'fk_orders_customer']
    ),

    // ── Spatial types ────────────────────────────────────────────────────────
    check(
        'geography_column',
        `create table dbo.Locations (Id int not null primary key, Name nvarchar(200) not null, Coords geography not null)`,
        ['geography', 'coords']
    ),
    check(
        'geometry_column',
        `create table dbo.Shapes (Id int not null primary key, Shape geometry not null)`,
        ['geometry', 'shape']
    ),
    check(
        'spatial_index',
        `create spatial index IX_Locations_Coords on dbo.Locations (Coords) using geography_auto_grid with (cells_per_object = 16)`,
        ['spatial', 'index', 'ix_locations_coords', 'dbo.locations', 'coords', 'using', 'geography_auto_grid']
    ),
    check(
        'stgeomfromtext',
        `insert into dbo.Locations (Id, Name, Coords) values (1, 'HQ', geography::STGeomFromText('POINT(-122.33 47.6)', 4326))`,
        ['stgeomfromtext', 'point', '-122.33', '47.6', '4326']
    ),

    // ── XML schema collection ─────────────────────────────────────────────────
    check(
        'xml_typed_column',
        `create table dbo.Orders (OrderId int not null primary key, OrderXml xml(dbo.OrderSchema) not null)`,
        ['xml', 'dbo.orderschema', 'orderxml']
    ),

    // ── FILTERED index ────────────────────────────────────────────────────────
    check(
        'create_filtered_index',
        `create index IX_Active on dbo.Orders (OrderDate) where Status = 'Active'`,
        ['create', 'index', 'ix_active', 'dbo.orders', 'orderdate', 'where', 'active']
    ),

    // ── INCLUDE + FILTER ──────────────────────────────────────────────────────
    check(
        'create_index_include_filter',
        `create nonclustered index IX_Cust_Date on dbo.Orders (CustomerId, OrderDate desc) include (Amount, Status) where Status <> 'Cancelled'`,
        ['nonclustered', 'index', 'include', 'amount', 'status', 'where', 'cancelled']
    ),

    // ── sp_help / sp_helptext ─────────────────────────────────────────────────
    check(
        'sp_help',
        `exec sp_help 'dbo.Orders'`,
        ['exec', 'sp_help', 'dbo.orders']
    ),
    check(
        'sp_helptext',
        `exec sp_helptext 'dbo.GetOrder'`,
        ['exec', 'sp_helptext', 'dbo.getorder']
    ),

    // ── UPDATE with TOP ───────────────────────────────────────────────────────
    check(
        'update_top',
        `update top (100) dbo.Orders set Status = 'Processed' where Status = 'Pending'`,
        ['update', 'top', '100', 'dbo.orders', 'set', 'status', 'processed', 'pending']
    ),

    // ── DELETE with TOP ───────────────────────────────────────────────────────
    check(
        'delete_top',
        `delete top (1000) from dbo.Audit where CreatedDate < '2020-01-01'`,
        ['delete', 'top', '1000', 'from', 'dbo.audit', 'createddate']
    ),

    // ── INSTEAD OF trigger with multiple events ───────────────────────────────
    check(
        'instead_of_insert_update',
        `create trigger trgView on dbo.OrderView instead of insert, update as begin insert into dbo.Orders select * from inserted end`,
        ['create', 'trigger', 'instead', 'of', 'insert', 'update', 'dbo.orderview', 'dbo.orders']
    ),

    // ── WITH (options) on CTE ─────────────────────────────────────────────────
    check(
        'cte_in_update',
        `with OldOrders as (select OrderId from dbo.Orders where OrderDate < '2020-01-01') update o set o.Status = 'Archived' from dbo.Orders o join OldOrders oo on o.OrderId = oo.OrderId`,
        ['with', 'oldorders', 'update', 'set', 'archived', 'join']
    ),
    check(
        'cte_in_delete',
        `with Duplicates as (select Id, row_number() over (partition by Email order by Id) as Rn from dbo.Customers) delete from Duplicates where Rn > 1`,
        ['with', 'duplicates', 'row_number', 'delete', 'from', 'duplicates', 'rn', '1']
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

console.log(`\nProbe 29 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
