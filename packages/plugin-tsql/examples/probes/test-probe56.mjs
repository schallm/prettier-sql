/**
 * Probe 56 — XML DML, spatial methods, HierarchyID, and edge-case expressions:
 *   - XML .query() / .value() / .exist() / .nodes() / .modify()
 *   - Spatial method calls: .STDistance / .STBuffer / .STArea / .STContains
 *   - HIERARCHYID methods: .GetAncestor / .GetLevel / .IsDescendantOf
 *   - Method calls on computed columns
 *   - CAST to XML
 *   - XML variables
 *   - XQuery expressions in .query() and .value()
 *   - SET @xml.modify() (UPDATE/INSERT/DELETE XML nodes)
 *   - CROSS APPLY .nodes()
 *   - WITH XMLNAMESPACES
 *   - Complex CASE with arithmetic in THEN
 *   - IIF with complex conditions
 *   - NULLIF with expression
 *   - COALESCE with many args
 *   - Subquery in CASE WHEN
 *   - String functions: STUFF / REPLACE / PATINDEX
 *   - SOUNDEX / DIFFERENCE
 *   - STR / SPACE / REPLICATE
 *   - CHARINDEX nested
 *   - LEN / DATALENGTH
 *   - LEFT / RIGHT / SUBSTRING
 *   - ASCII / UNICODE / CHAR / NCHAR
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
    // ── XML method calls ──────────────────────────────────────────────────────
    check(
        'xml_query_value',
        `select Settings.query('/config/item') as Items, Settings.value('(/config/maxRetries)[1]', 'int') as MaxRetries from dbo.AppConfig`,
        ['settings.query', 'settings.value', '/config/item', 'maxretries']
    ),
    check(
        'xml_exist',
        `select * from dbo.Orders where OrderXml.exist('/order/items/item[@qty > 0]') = 1`,
        ['orderxml.exist', '/order/items/item', 'qty > 0', '= 1']
    ),
    check(
        'xml_nodes_cross_apply',
        `select n.value('@id', 'int') as ItemId, n.value('@qty', 'int') as Qty from dbo.Orders cross apply OrderXml.nodes('/order/items/item') t(n)`,
        ['cross apply', 'orderxml.nodes', '/order/items/item', 'itemid', 'qty']
    ),

    // ── STUFF / REPLACE / PATINDEX ────────────────────────────────────────────
    check(
        'stuff_replace',
        `select stuff(Phone, 1, 3, '555'), replace(Email, '@company.com', '@newco.com'), patindex('%[0-9]%', PostalCode) from dbo.Customers`,
        ['stuff', 'phone', "'555'", 'replace', 'email', 'patindex', "'%[0-9]%'", 'postalcode']
    ),

    // ── SOUNDEX / DIFFERENCE ──────────────────────────────────────────────────
    check(
        'soundex',
        `select soundex(Name), difference(Name, 'Smith') from dbo.Customers where difference(Name, 'Smyth') > 2`,
        ['soundex', 'difference', "'smith'", "'smyth'", '> 2']
    ),

    // ── STR / SPACE / REPLICATE ───────────────────────────────────────────────
    check(
        'str_space_replicate',
        `select str(Amount, 12, 2) as AmtStr, space(5) as Gap, replicate('*', 10) as Stars`,
        ['str', 'amount', 'amtstr', 'space', 'gap', 'replicate', "'*'", 'stars']
    ),

    // ── CHARINDEX nested ──────────────────────────────────────────────────────
    check(
        'charindex_nested',
        `select substring(Email, 1, charindex('@', Email) - 1) as Username, substring(Email, charindex('@', Email) + 1, len(Email)) as Domain from dbo.Customers`,
        ['substring', 'charindex', 'username', 'domain', 'len']
    ),

    // ── LEN / DATALENGTH ──────────────────────────────────────────────────────
    check(
        'len_datalength',
        `select len(Name), datalength(Name), len(rtrim(ltrim(Name))) from dbo.Customers where len(Name) > 50`,
        ['len(name)', 'datalength', 'rtrim', 'ltrim', 'where len']
    ),

    // ── COALESCE with many args ───────────────────────────────────────────────
    check(
        'coalesce_many',
        `select coalesce(Phone1, Phone2, Phone3, Mobile, AltPhone, 'N/A') as BestPhone from dbo.Contacts`,
        ['coalesce', 'phone1', 'phone2', 'phone3', 'mobile', 'altphone', "'n/a'", 'bestphone']
    ),

    // ── IIF with complex condition ────────────────────────────────────────────
    check(
        'iif_complex',
        `select iif(Amount > 1000 and Status = 'Active', 'High Value Active', 'Other') as Category from dbo.Orders`,
        ['iif', 'amount > 1000', "'active'", "'high value active'", "'other'", 'category']
    ),

    // ── CASE with subquery in WHEN ────────────────────────────────────────────
    check(
        'case_subquery_when',
        `select OrderId, case when CustomerId in (select Id from dbo.VipCustomers) then 'VIP' when Amount > 5000 then 'Large' else 'Regular' end as OrderType from dbo.Orders`,
        ['case', 'in (select id', 'vip', 'large', 'regular', 'ordertype']
    ),

    // ── Spatial methods ───────────────────────────────────────────────────────
    check(
        'spatial_methods',
        `select l.Id, l.GeoPoint.STDistance(geography::Point(47.6, -122.3, 4326)) as DistanceMeters from dbo.Locations l where l.GeoPoint.STDistance(geography::Point(47.6, -122.3, 4326)) < 1000`,
        ['geopoint.stdistance', 'geography::point', '47.6', '-122.3', '4326', 'distancemeters', '< 1000']
    ),

    // ── HIERARCHYID methods ───────────────────────────────────────────────────
    check(
        'hierarchyid_methods',
        `select Id, Name, Id.GetLevel() as Level, Id.GetAncestor(1) as ParentId from dbo.OrgChart where Id.IsDescendantOf(cast('/1/' as hierarchyid)) = 1`,
        ['id.getlevel', 'id.getancestor', 'parentid', 'id.isdescendantof', 'hierarchyid']
    ),

    // ── NULLIF with expression ────────────────────────────────────────────────
    check(
        'nullif_expr',
        `select nullif(Amount, 0), nullif(ltrim(rtrim(Name)), ''), nullif(coalesce(Phone, ''), '') from dbo.Customers`,
        ['nullif', 'amount', '0', 'ltrim', 'rtrim', "''"]
    ),

    // ── WITH XMLNAMESPACES ────────────────────────────────────────────────────
    check(
        'with_xmlnamespaces',
        `with xmlnamespaces ('http://schemas.example.com/v1' as ns) select Id, Settings.value('(ns:config/ns:maxRetries)[1]', 'int') as MaxRetries from dbo.AppConfig`,
        ['with xmlnamespaces', 'http://schemas.example.com/v1', 'as ns', 'settings.value', 'maxretries']
    ),

    // ── SET @xml.modify() ─────────────────────────────────────────────────────
    check(
        'xml_modify',
        `declare @xml xml = '<root><item id="1"/></root>'; set @xml.modify('insert <item id="2"/> as last into (/root)[1]')`,
        ['set @xml.modify', 'insert', 'as last into']
    ),

    // ── Complex nested expression ─────────────────────────────────────────────
    check(
        'nested_expression',
        `select case when cast(substring(PostalCode, 1, 5) as int) between 10000 and 19999 then 'Northeast' when cast(substring(PostalCode, 1, 5) as int) between 20000 and 39999 then 'Southeast' else 'Other' end as Region from dbo.Addresses`,
        ['cast', 'substring', 'postalcode', '10000', 'northeast', 'southeast', 'other', 'region']
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

console.log(`\nProbe 56 results: ${pass} pass, ${fail} fail\n`);
for (const f of failures) {
    console.log(`FAIL [${f.label}]`);
    console.log(`  Input:   ${f.input.substring(0, 120)}`);
    console.log(`  Output:  ${f.out.substring(0, 400)}`);
    console.log(`  Missing: ${f.missing.join(', ')}`);
    console.log();
}
