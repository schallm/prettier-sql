/**
 * Thirteenth probe — security (keys/certs), CREATE ASSEMBLY, SET options,
 * XMLNAMESPACES, complex expressions, and Service Broker objects.
 * These mostly hit the raw-text fallback — we validate keyword preservation.
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

// ── CREATE MASTER KEY ──────────────────────────────────────────────────────
await t('create_master_key',
    `create master key encryption by password = 'Str0ng!Pass';`,
    ['create master key', 'encryption by password']);

// ── DROP MASTER KEY ────────────────────────────────────────────────────────
await t('drop_master_key',
    `drop master key;`,
    ['drop master key']);

// ── BACKUP MASTER KEY ──────────────────────────────────────────────────────
await t('backup_master_key',
    `backup master key to file = 'C:\\backups\\master.key'
     encryption by password = 'Str0ng!BackupPass';`,
    ['backup master key', 'to file', 'encryption by password']);

// ── RESTORE MASTER KEY ─────────────────────────────────────────────────────
await t('restore_master_key',
    `restore master key from file = 'C:\\backups\\master.key'
     decryption by password = 'Str0ng!BackupPass'
     encryption by password = 'NewStr0ng!Pass'
     force;`,
    ['restore master key', 'decryption by password', 'encryption by password', 'force']);

// ── CREATE CERTIFICATE (self-signed) ──────────────────────────────────────
await t('create_certificate_self',
    `create certificate MyCert
     with subject = 'My Application Certificate',
          expiry_date = '2030-12-31';`,
    ['create certificate MyCert', "subject = 'My Application Certificate'", 'expiry_date']);

// ── CREATE CERTIFICATE from file ──────────────────────────────────────────
await t('create_certificate_file',
    `create certificate MyCert
     from file = 'C:\\certs\\mycert.cer'
     with private key (
         file = 'C:\\certs\\mykey.pvk',
         decryption by password = 'KeyPass!'
     );`,
    ['create certificate MyCert', 'from file', 'with private key', 'decryption by password']);

// ── CREATE SYMMETRIC KEY ──────────────────────────────────────────────────
await t('create_symmetric_key',
    `create symmetric key DataKey
     with algorithm = aes_256
     encryption by certificate MyCert;`,
    ['create symmetric key DataKey', 'algorithm = aes_256', 'encryption by certificate MyCert']);

// ── OPEN SYMMETRIC KEY ────────────────────────────────────────────────────
await t('open_symmetric_key',
    `open symmetric key DataKey decryption by certificate MyCert;`,
    ['open symmetric key DataKey', 'decryption by certificate MyCert']);

// ── CLOSE SYMMETRIC KEY ───────────────────────────────────────────────────
await t('close_symmetric_key',
    `close symmetric key DataKey;`,
    ['close symmetric key DataKey']);

await t('close_all_symmetric_keys',
    `close all symmetric keys;`,
    ['close all symmetric keys']);

// ── CREATE ASYMMETRIC KEY ─────────────────────────────────────────────────
await t('create_asymmetric_key',
    `create asymmetric key AsymKey
     with algorithm = rsa_2048
     encryption by password = 'Str0ng!';`,
    ['create asymmetric key AsymKey', 'algorithm = rsa_2048', 'encryption by password']);

// ── DROP CERTIFICATE ──────────────────────────────────────────────────────
await t('drop_certificate',
    `drop certificate MyCert;`,
    ['drop certificate MyCert']);

// ── DROP SYMMETRIC KEY ────────────────────────────────────────────────────
await t('drop_symmetric_key',
    `drop symmetric key DataKey;`,
    ['drop symmetric key DataKey']);

// ── CREATE ASSEMBLY ────────────────────────────────────────────────────────
await t('create_assembly',
    `create assembly SqlAssembly
     from 'C:\\assemblies\\SqlAssembly.dll'
     with permission_set = safe;`,
    ['create assembly SqlAssembly', 'permission_set = safe']);

// ── DROP ASSEMBLY ──────────────────────────────────────────────────────────
await t('drop_assembly',
    `drop assembly SqlAssembly with no dependents;`,
    ['drop assembly SqlAssembly', 'no dependents']);

// ── SET LANGUAGE ──────────────────────────────────────────────────────────
await t('set_language',
    `set language N'English';`,
    ['set language', "N'English'"]);

// ── SET DATEFORMAT ─────────────────────────────────────────────────────────
await t('set_dateformat',
    `set dateformat mdy;`,
    ['set dateformat', 'mdy']);

// ── SET DATEFIRST ──────────────────────────────────────────────────────────
await t('set_datefirst',
    `set datefirst 1;`,
    ['set datefirst', '1']);

// ── SET PARSEONLY ──────────────────────────────────────────────────────────
await t('set_parseonly',
    `set parseonly on;`,
    ['set parseonly', 'on']);

// ── SET NOEXEC ────────────────────────────────────────────────────────────
await t('set_noexec',
    `set noexec on;`,
    ['set noexec', 'on']);

// ── SET FORCEPLAN ──────────────────────────────────────────────────────────
await t('set_forceplan',
    `set forceplan on;`,
    ['set forceplan', 'on']);

// ── SET TEXTSIZE ──────────────────────────────────────────────────────────
await t('set_textsize',
    `set textsize 1000000;`,
    ['set textsize', '1000000']);

// ── XMLNAMESPACES in WITH clause ──────────────────────────────────────────
await t('xmlnamespaces_with',
    `with xmlnamespaces (
         'http://schemas.example.com/orders' as ns,
         default 'http://schemas.example.com/default'
     )
     select Id, Data.query('/ns:Order/ns:Item') as Items
     from dbo.XmlOrders;`,
    ['xmlnamespaces', "'http://schemas.example.com/orders'",
     'default', 'ns:Order/ns:Item']);

// ── FOR XML PATH with ELEMENTS ────────────────────────────────────────────
await t('for_xml_path_elements',
    `select Id as '@Id', Name as 'Customer/Name', Email as 'Customer/Email'
     from dbo.Customers
     for xml path('Order'), root('Orders'), elements xsinil;`,
    ["for xml path('Order')", "root('Orders')", 'elements xsinil']);

// ── FOR XML with XMLSCHEMA ────────────────────────────────────────────────
await t('for_xml_with_xmlschema',
    `select Id, Name from dbo.T for xml auto, xmlschema('urn:example');`,
    ['for xml auto', "xmlschema('urn:example')"]);

// ── Complex GROUPING SETS ─────────────────────────────────────────────────
await t('grouping_sets_complex',
    `select Region, Product, Quarter, sum(Amount) as Total
     from dbo.Sales
     group by grouping sets (
         (Region, Product),
         (Region, Quarter),
         (Region),
         ()
     );`,
    ['grouping sets', '(Region, Product)', '(Region, Quarter)', '(Region)', 'sum(Amount)']);

// ── ROLLUP ─────────────────────────────────────────────────────────────────
await t('group_by_rollup',
    `select Region, Product, sum(Amount) as Total
     from dbo.Sales
     group by rollup (Region, Product);`,
    ['group by rollup', 'Region, Product']);

// ── CUBE ───────────────────────────────────────────────────────────────────
await t('group_by_cube',
    `select Region, Product, sum(Amount) as Total
     from dbo.Sales
     group by cube (Region, Product);`,
    ['group by cube', 'Region, Product']);

// ── GROUPING_ID ────────────────────────────────────────────────────────────
await t('grouping_id_fn',
    `select Region, Product, sum(Amount) as Total, grouping_id(Region, Product) as GrpId
     from dbo.Sales
     group by rollup (Region, Product);`,
    ['grouping_id(Region, Product)', 'GrpId']);

// ── Named window (WINDOW clause) — SQL Server 2022 ────────────────────────
await t('named_window',
    `select Id, Amount,
         sum(Amount) over CustWin as CustTotal,
         avg(Amount) over CustWin as CustAvg
     from dbo.Orders
     window CustWin as (partition by CustId order by OrderDate);`,
    ['window CustWin as', 'partition by CustId', 'over CustWin']);

// ── Service Broker: CREATE SERVICE ────────────────────────────────────────
await t('create_service',
    `create service [//OrderService]
     on queue dbo.OrderQueue ([//OrderContract]);`,
    ['create service', '//OrderService', 'on queue dbo.OrderQueue', '//OrderContract']);

// ── Service Broker: ALTER SERVICE ─────────────────────────────────────────
await t('alter_service',
    `alter service [//OrderService]
     (add contract [//BillingContract], drop contract [//OldContract]);`,
    ['alter service', '//OrderService', 'add contract', '//BillingContract',
     'drop contract', '//OldContract']);

// ── Service Broker: CREATE REMOTE SERVICE BINDING ─────────────────────────
await t('create_remote_service_binding',
    `create remote service binding MyBinding
     to service '//RemoteService'
     with user = RemoteUser, anonymous = on;`,
    ['create remote service binding MyBinding', '//RemoteService',
     'user = RemoteUser', 'anonymous = on']);

// ── SET QUERY_GOVERNOR_COST_LIMIT ─────────────────────────────────────────
await t('set_query_governor',
    `set query_governor_cost_limit 30;`,
    ['set query_governor_cost_limit', '30']);

// ── CREATE XML SCHEMA COLLECTION ──────────────────────────────────────────
await t('create_xml_schema',
    `create xml schema collection dbo.OrderSchema as
     N'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Order" type="xs:string"/>
     </xs:schema>';`,
    ['create xml schema collection dbo.OrderSchema', 'xs:schema', 'xs:element']);

// ── Computed column with complex expression ────────────────────────────────
await t('computed_col_complex',
    `create table dbo.Orders (
        Id int not null,
        UnitPrice decimal(10,2) not null,
        Qty int not null,
        TaxRate decimal(5,4) not null default 0.0875,
        Subtotal as (UnitPrice * Qty) persisted,
        TaxAmt as (UnitPrice * Qty * TaxRate),
        TotalAmt as (UnitPrice * Qty * (1 + TaxRate)) persisted
     );`,
    ['UnitPrice * Qty) persisted', 'UnitPrice * Qty * TaxRate', 'persisted']);

// ── ENCRYPTBYPASSPHRASE / DECRYPTBYPASSPHRASE ─────────────────────────────
await t('encrypt_decrypt_passphrase',
    `insert into dbo.Secrets (Name, Data)
     values ('Key1', encryptbypassphrase('p@ssw0rd', 'SensitiveData'));
     select cast(decryptbypassphrase('p@ssw0rd', Data) as nvarchar(100)) from dbo.Secrets;`,
    ["encryptbypassphrase('p@ssw0rd'", "decryptbypassphrase('p@ssw0rd'"]);

console.log(`\n${ok} passed, ${fail} failed`);
