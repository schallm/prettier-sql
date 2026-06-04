/**
 * Probe 28 — Full-text search, BACKUP/RESTORE options, OPENXML,
 *             CLR assembly concepts, HIERARCHYID, ALTER DATABASE SCOPED CONFIG,
 *             CONTAINS / FREETEXT / CONTAINSTABLE / FREETEXTTABLE,
 *             CHECKSUM / BINARY_CHECKSUM, HASHBYTES,
 *             AT TIME ZONE, DATETIMEOFFSET patterns,
 *             SWITCH PARTITION details, MERGE with DELETE branch,
 *             CROSS JOIN lateral, FOR XML EXPLICIT
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
    // ── FULL-TEXT SEARCH ──────────────────────────────────────────────────────
    check(
        'contains',
        `select * from dbo.Products where contains(Description, '"electric" AND "blue"')`,
        ['contains', 'description', 'electric', 'blue']
    ),
    check(
        'freetext',
        `select * from dbo.Products where freetext(Description, 'large screen high resolution')`,
        ['freetext', 'description', 'large screen']
    ),
    check(
        'containstable',
        `select k.Rank, p.Name from containstable(dbo.Products, Description, 'software') as k join dbo.Products p on k.[key] = p.ProductId order by k.Rank desc`,
        ['containstable', 'dbo.products', 'description', 'software', 'rank']
    ),
    check(
        'freetexttable',
        `select k.Rank, p.Name from freetexttable(dbo.Products, *, 'mobile phone') as k join dbo.Products p on k.[key] = p.ProductId`,
        ['freetexttable', 'dbo.products', 'mobile phone', 'rank']
    ),

    // ── BACKUP / RESTORE ──────────────────────────────────────────────────────
    check(
        'backup_simple',
        `backup database MyDb to disk = 'C:\\Backup\\MyDb.bak' with name = 'Full Backup', compression, stats = 10`,
        ['backup', 'database', 'mydb', 'to', 'disk', 'c:\\backup\\mydb.bak', 'with', 'name', 'compression', 'stats', '10']
    ),
    check(
        'backup_log',
        `backup log MyDb to disk = 'C:\\Backup\\MyDb.log' with norecovery, stats = 5`,
        ['backup', 'log', 'mydb', 'to', 'disk', 'norecovery', 'stats']
    ),
    check(
        'backup_differential',
        `backup database MyDb to disk = 'C:\\Backup\\MyDb_diff.bak' with differential, stats = 10`,
        ['backup', 'database', 'differential']
    ),
    check(
        'restore_database',
        `restore database MyDb from disk = 'C:\\Backup\\MyDb.bak' with move 'MyDb' to 'C:\\Data\\MyDb.mdf', move 'MyDb_log' to 'C:\\Data\\MyDb.ldf', recovery, stats = 10`,
        ['restore', 'database', 'mydb', 'from', 'disk', 'with', 'move', 'mydb', 'recovery', 'stats', '10']
    ),
    check(
        'restore_filelistonly',
        `restore filelistonly from disk = 'C:\\Backup\\MyDb.bak'`,
        ['restore', 'filelistonly', 'from', 'disk']
    ),
    check(
        'restore_headeronly',
        `restore headeronly from disk = 'C:\\Backup\\MyDb.bak'`,
        ['restore', 'headeronly', 'from', 'disk']
    ),

    // ── OPENXML ───────────────────────────────────────────────────────────────
    check(
        'openxml',
        `declare @hDoc int; exec sp_xml_preparedocument @hDoc output, '<root><item id="1" name="test"/></root>'; select * from openxml(@hDoc, '/root/item', 1) with (Id int '@id', Name nvarchar(50) '@name'); exec sp_xml_removedocument @hDoc`,
        ['openxml', '@hdoc', '/root/item', 'id', 'name', 'sp_xml_preparedocument', 'sp_xml_removedocument']
    ),

    // ── AT TIME ZONE ──────────────────────────────────────────────────────────
    check(
        'at_time_zone',
        `select OrderDate at time zone 'UTC' at time zone 'Eastern Standard Time' from dbo.Orders`,
        ['at', 'time', 'zone', 'utc', 'eastern standard time']
    ),

    // ── DATETIMEOFFSET ────────────────────────────────────────────────────────
    check(
        'switchoffset',
        `select switchoffset(OrderDate, '+05:00') from dbo.Orders`,
        ['switchoffset', 'orderdate', '+05:00']
    ),
    check(
        'todatetimeoffset',
        `select todatetimeoffset(OrderDate, @tzOffset) from dbo.Orders`,
        ['todatetimeoffset', 'orderdate', '@tzoffset']
    ),

    // ── HASHBYTES ─────────────────────────────────────────────────────────────
    check(
        'hashbytes',
        `select hashbytes('SHA2_256', cast(OrderId as nvarchar(10))) from dbo.Orders`,
        ['hashbytes', 'sha2_256', 'orderid', 'nvarchar']
    ),
    check(
        'checksum',
        `select checksum(OrderId, CustomerId, Amount) from dbo.Orders`,
        ['checksum', 'orderid', 'customerid', 'amount']
    ),
    check(
        'binary_checksum',
        `select binary_checksum(*) from dbo.Orders`,
        ['binary_checksum']
    ),

    // ── MERGE with DELETE branch ───────────────────────────────────────────────
    check(
        'merge_full',
        `merge dbo.Target t using dbo.Source s on t.Id = s.Id when matched and s.Active = 0 then delete when matched then update set t.Name = s.Name when not matched then insert (Id, Name) values (s.Id, s.Name);`,
        ['merge', 'when', 'matched', 'and', 'active', '0', 'then', 'delete', 'when', 'matched', 'then', 'update', 'when', 'not', 'matched', 'then', 'insert']
    ),

    // ── HIERARCHYID ───────────────────────────────────────────────────────────
    check(
        'hierarchyid_column',
        `create table dbo.OrgChart (NodeId hierarchyid not null primary key, NodeName nvarchar(200) not null, Level as NodeId.GetLevel() persisted)`,
        ['hierarchyid', 'nodeid', 'nodename', 'getlevel', 'persisted']
    ),
    check(
        'hierarchyid_methods',
        `select NodeId.GetLevel(), NodeId.ToString(), NodeId.GetAncestor(1).ToString() from dbo.OrgChart`,
        ['getlevel', 'tostring', 'getancestor', '1']
    ),

    // ── ALTER DATABASE SCOPED CONFIGURATION ──────────────────────────────────
    check(
        'alter_db_scoped_config',
        `alter database scoped configuration set maxdop = 4`,
        ['alter', 'database', 'scoped', 'configuration', 'set', 'maxdop', '4']
    ),
    check(
        'alter_db_scoped_config_for_secondary',
        `alter database scoped configuration for secondary set maxdop = 0`,
        ['alter', 'database', 'scoped', 'configuration', 'for', 'secondary', 'set', 'maxdop']
    ),

    // ── CREATE ASSEMBLY ───────────────────────────────────────────────────────
    check(
        'create_assembly',
        `create assembly MyAssembly from 'C:\\bin\\MyLib.dll' with permission_set = safe`,
        ['create', 'assembly', 'myassembly', 'from', 'c:\\bin\\mylib.dll', 'with', 'permission_set', 'safe']
    ),

    // ── INSERT ... SELECT with CTE ────────────────────────────────────────────
    check(
        'insert_cte',
        `with Src as (select Id, Name from dbo.Source where IsNew = 1) insert into dbo.Target (Id, Name) select Id, Name from Src`,
        ['with', 'src', 'as', 'isnew', 'insert', 'into', 'dbo.target', 'id', 'name', 'select', 'from', 'src']
    ),

    // ── FOR XML PATH ──────────────────────────────────────────────────────────
    check(
        'for_xml_path',
        `select OrderId as '@Id', OrderDate as 'Date', CustomerId as 'Customer' from dbo.Orders for xml path('Order'), root('Orders')`,
        ['for', 'xml', 'path', 'order', 'root', 'orders']
    ),
    check(
        'for_xml_raw',
        `select OrderId, OrderDate from dbo.Orders for xml raw('Order'), elements`,
        ['for', 'xml', 'raw', 'order', 'elements']
    ),

    // ── STUFF FOR XML PATH (concat pattern) ──────────────────────────────────
    check(
        'stuff_for_xml',
        `select stuff((select ',' + TagName from dbo.Tags where OrderId = o.OrderId for xml path('')), 1, 1, '') from dbo.Orders o`,
        ['stuff', 'select', "','", 'tagname', 'for', 'xml', 'path']
    ),

    // ── DATEADD / DATEDIFF / DATEPART ────────────────────────────────────────
    check(
        'dateadd',
        `select dateadd(day, 30, OrderDate) from dbo.Orders`,
        ['dateadd', 'day', '30', 'orderdate']
    ),
    check(
        'datediff',
        `select datediff(hour, StartTime, EndTime) from dbo.Tasks`,
        ['datediff', 'hour', 'starttime', 'endtime']
    ),
    check(
        'datepart',
        `select datepart(weekday, OrderDate) from dbo.Orders`,
        ['datepart', 'weekday', 'orderdate']
    ),
    check(
        'eomonth',
        `select eomonth(OrderDate, 1) from dbo.Orders`,
        ['eomonth', 'orderdate', '1']
    ),

    // ── AGGREGATE IN UPDATE ────────────────────────────────────────────────────
    check(
        'update_from_subquery',
        `update dbo.Customers set TotalAmount = (select sum(Amount) from dbo.Orders where CustomerId = c.CustomerId) from dbo.Customers c`,
        ['update', 'dbo.customers', 'set', 'totalamount', 'select', 'sum(amount)', 'from', 'dbo.orders', 'customerid']
    ),

    // ── SELECT with multiple subqueries ───────────────────────────────────────
    check(
        'exists_not_exists',
        `select * from dbo.Customers c where exists (select 1 from dbo.Orders o where o.CustomerId = c.Id) and not exists (select 1 from dbo.Blocked b where b.CustomerId = c.Id)`,
        ['exists', 'select', '1', 'not', 'exists', 'dbo.blocked']
    ),

    // ── CONVERT with style ────────────────────────────────────────────────────
    check(
        'convert_with_style',
        `select convert(nvarchar(20), OrderDate, 101), convert(nvarchar(20), OrderDate, 120)`,
        ['convert', 'nvarchar', 'orderdate', '101', '120']
    ),
    check(
        'convert_varbinary',
        `select convert(varbinary(max), 'Hello World')`,
        ['convert', 'varbinary', 'max', 'hello world']
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

console.log(`\nProbe 28 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 350)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
