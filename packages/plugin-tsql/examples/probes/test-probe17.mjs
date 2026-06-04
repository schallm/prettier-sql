/**
 * Seventeenth probe — EXECUTE AS context, synonyms, sequences, linked server,
 * bulk operations, OPENQUERY/OPENROWSET, service broker contracts/queues,
 * waitfor, send/receive, event notifications, database triggers, partitioned views.
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

// ── CREATE SYNONYM ─────────────────────────────────────────────────────────
await t('create_synonym',
    `create synonym dbo.Ord for dbo.Orders;`,
    ['create synonym dbo.Ord', 'for dbo.Orders']);

await t('create_synonym_linked',
    `create synonym dbo.RemoteOrders for LinkedServer.RemoteDB.dbo.Orders;`,
    ['create synonym dbo.RemoteOrders', 'LinkedServer.RemoteDB.dbo.Orders']);

// ── DROP SYNONYM ───────────────────────────────────────────────────────────
await t('drop_synonym',
    `drop synonym if exists dbo.Ord;`,
    ['drop synonym', 'dbo.Ord']);

// ── CREATE SEQUENCE ────────────────────────────────────────────────────────
await t('create_sequence',
    `create sequence dbo.OrderSeq
     as bigint
     start with 1000
     increment by 1
     minvalue 1000
     maxvalue 9999999
     no cycle
     cache 50;`,
    ['create sequence dbo.OrderSeq', 'as bigint', 'start with 1000',
     'increment by 1', 'minvalue 1000', 'maxvalue 9999999',
     'no cycle', 'cache 50']);

// ── ALTER SEQUENCE ─────────────────────────────────────────────────────────
await t('alter_sequence',
    `alter sequence dbo.OrderSeq restart with 1 increment by 5 no cache;`,
    ['alter sequence dbo.OrderSeq', 'restart with 1', 'increment by 5', 'no cache']);

// ── DROP SEQUENCE ──────────────────────────────────────────────────────────
await t('drop_sequence',
    `drop sequence if exists dbo.OrderSeq;`,
    ['drop sequence', 'dbo.OrderSeq']);

// ── NEXT VALUE FOR ─────────────────────────────────────────────────────────
await t('next_value_for',
    `insert into dbo.Orders (Id, Name)
     values (next value for dbo.OrderSeq, 'Test');`,
    ['next value for dbo.OrderSeq']);

// ── EXECUTE AS / REVERT ────────────────────────────────────────────────────
await t('execute_as_login',
    `execute as login = 'domainuser';`,
    ['execute as login', "domainuser"]);

await t('execute_as_user',
    `execute as user = 'dbo';`,
    ["execute as user = 'dbo'"]);

await t('revert_with_cookie',
    `revert with cookie = @cookie;`,
    ['revert', 'with cookie']);

// ── CREATE LINKED SERVER ───────────────────────────────────────────────────
await t('create_linked_server',
    `exec sp_addlinkedserver
       @server = N'MyLinkedServer',
       @srvproduct = N'',
       @provider = N'SQLNCLI',
       @datasrc = N'192.168.1.100\SQLEXPRESS';`,
    ['sp_addlinkedserver', 'MyLinkedServer', 'SQLNCLI']);

// ── OPENQUERY ─────────────────────────────────────────────────────────────
await t('openquery',
    `select * from openquery(MyLinkedServer, 'select Id, Name from dbo.Orders');`,
    ['openquery', 'MyLinkedServer']);

// ── OPENROWSET ────────────────────────────────────────────────────────────
await t('openrowset_bulk',
    `select * from openrowset(bulk 'C:\data\import.csv',
       formatfile = 'C:\data\format.xml',
       firstrow = 2) as t;`,
    ['openrowset', 'bulk', 'import.csv', 'firstrow = 2']);

// ── BULK INSERT ────────────────────────────────────────────────────────────
await t('bulk_insert',
    `bulk insert dbo.Orders
     from 'C:\\data\\orders.csv'
     with (fieldterminator = ',', rowterminator = '\\n', firstrow = 2, tablock);`,
    ['bulk insert dbo.Orders', "from 'C:\\data\\orders.csv'",
     'fieldterminator', 'rowterminator', 'firstrow = 2', 'tablock']);

// ── WAITFOR DELAY ─────────────────────────────────────────────────────────
await t('waitfor_delay',
    `waitfor delay '00:00:30';`,
    ['waitfor delay', "'00:00:30'"]);

// ── WAITFOR TIME ──────────────────────────────────────────────────────────
await t('waitfor_time',
    `waitfor time '23:00:00';`,
    ['waitfor time', "'23:00:00'"]);

// ── Service Broker: CREATE CONTRACT ───────────────────────────────────────
await t('create_contract',
    `create contract OrderContract
     (OrderMessage sent by initiator,
      AckMessage sent by target);`,
    ['create contract OrderContract', 'OrderMessage sent by initiator',
     'AckMessage sent by target']);

// ── Service Broker: CREATE QUEUE ──────────────────────────────────────────
await t('create_queue',
    `create queue dbo.OrderQueue
     with status = on,
          retention = off,
          activation (
              status = on,
              procedure_name = dbo.usp_ProcessOrder,
              max_queue_readers = 5,
              execute as owner
          );`,
    ['create queue dbo.OrderQueue', 'status = on', 'retention = off',
     'procedure_name = dbo.usp_ProcessOrder', 'max_queue_readers = 5']);

// ── Service Broker: CREATE SERVICE ────────────────────────────────────────
await t('create_service',
    `create service OrderService
     on queue dbo.OrderQueue (OrderContract);`,
    ['create service OrderService', 'on queue dbo.OrderQueue', 'OrderContract']);

// ── Service Broker: SEND ON CONVERSATION ──────────────────────────────────
await t('send_on_conversation',
    `send on conversation @handle
     message type OrderMessage
     (N'<order><id>1</id></order>');`,
    ['send on conversation', 'message type OrderMessage']);

// ── Service Broker: RECEIVE ───────────────────────────────────────────────
await t('receive_from_queue',
    `receive top (10)
       conversation_handle, message_body
     from dbo.OrderQueue
     into @t;`,
    ['receive', 'conversation_handle', 'message_body',
     'from dbo.OrderQueue', 'into @t']);

// ── GET CONVERSATION GROUP ────────────────────────────────────────────────
await t('get_conversation_group',
    `get conversation group @group_id from dbo.OrderQueue;`,
    ['get conversation group', 'dbo.OrderQueue']);

// ── BEGIN DIALOG CONVERSATION ─────────────────────────────────────────────
await t('begin_dialog',
    `begin dialog conversation @handle
     from service OrderService
     to service 'TargetService'
     on contract OrderContract
     with lifetime = 3600;`,
    ['begin dialog conversation', 'from service OrderService',
     "to service 'TargetService'", 'on contract OrderContract',
     'with lifetime = 3600']);

// ── CREATE EVENT NOTIFICATION ─────────────────────────────────────────────
await t('create_event_notification',
    `create event notification AuditDDL
     on database
     for ddl_table_events
     to service 'AuditService', 'current database';`,
    ['create event notification AuditDDL', 'on database',
     'for ddl_table_events', "to service 'AuditService'"]);

// ── CREATE DATABASE TRIGGER ────────────────────────────────────────────────
await t('create_database_trigger',
    `create trigger trgAuditDDL on database
     for create_table, alter_table, drop_table
     as
     begin
         insert into dbo.DDLAudit (EventData, LoginName)
         values (eventdata(), original_login());
     end;`,
    ['create trigger trgAuditDDL on database',
     'for create_table, alter_table, drop_table',
     'eventdata()', 'original_login()']);

// ── DROP EVENT NOTIFICATION ───────────────────────────────────────────────
await t('drop_event_notification',
    `drop event notification AuditDDL on database;`,
    ['drop event notification AuditDDL', 'on database']);

// ── OPENXML ───────────────────────────────────────────────────────────────
await t('openxml',
    `declare @doc int;
     exec sp_xml_preparedocument @doc output, @xmlData;
     select * from openxml(@doc, '/root/row', 2)
     with (Id int, Name nvarchar(100));
     exec sp_xml_removedocument @doc;`,
    ['openxml', '/root/row', 'sp_xml_preparedocument', 'sp_xml_removedocument']);

// ── EXECUTE with return value ─────────────────────────────────────────────
await t('execute_return_val',
    `declare @ret int;
     execute @ret = dbo.usp_DoWork @param1 = 1, @param2 = 'test';
     select @ret as ReturnValue;`,
    ['execute @ret = dbo.usp_DoWork', '@param1 = 1']);

// ── CREATE PARTITION FUNCTION (range right) ────────────────────────────────
await t('create_partition_fn_right',
    `create partition function pf_Right(int)
     as range right for values (100, 200, 300);`,
    ['create partition function pf_Right', 'as range right',
     'for values (100, 200, 300)']);

// ── CREATE PARTITION SCHEME ────────────────────────────────────────────────
await t('create_partition_scheme',
    `create partition scheme ps_Orders
     as partition pf_Right
     to (fg1, fg2, fg3, fg4);`,
    ['create partition scheme ps_Orders', 'as partition pf_Right',
     'to (fg1, fg2, fg3, fg4)']);

console.log(`\n${ok} passed, ${fail} failed`);
