/**
 * Twelfth probe — remaining T-SQL constructs: Service Broker DDL,
 * ALTER TABLE edge cases, SELECT with FOR BROWSE/READ, sequence expressions,
 * WITHIN GROUP, AT TIME ZONE, TRY_PARSE, complex index hints, linked server
 * four-part names, and less-common built-in functions.
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

// ── Service Broker: BEGIN DIALOG CONVERSATION ─────────────────────────────
await t('begin_dialog',
    `begin dialog conversation @handle
     from service [//OrderService]
     to service '//ConfirmService'
     on contract [//OrderContract]
     with lifetime = 3600;`,
    ['begin dialog conversation', '//OrderService', '//ConfirmService',
     '//OrderContract', 'lifetime = 3600']);

// ── Service Broker: BEGIN CONVERSATION TIMER ──────────────────────────────
await t('begin_conversation_timer',
    `begin conversation timer (@handle) timeout = 60;`,
    ['begin conversation timer', 'timeout = 60']);

// ── Service Broker: MOVE CONVERSATION ────────────────────────────────────
await t('move_conversation',
    // Syntax: MOVE CONVERSATION handle TO group_id  (no CONVERSATION GROUP keywords)
    `move conversation @handle to @group_id;`,
    ['move conversation', '@group_id']);

// ── Service Broker: GET CONVERSATION GROUP ────────────────────────────────
await t('get_conversation_group',
    `get conversation group @group_id from dbo.OrderQueue;`,
    ['get conversation group', 'dbo.OrderQueue']);

// ── Service Broker: RECEIVE INTO variable table ───────────────────────────
await t('receive_into_var',
    `declare @t table (handle uniqueidentifier, mtype nvarchar(256), body varbinary(max));
     receive top (5) conversation_handle, message_type_name, message_body
     from dbo.OrderQueue
     into @t;`,
    ['receive top', 'conversation_handle', 'message_body', 'from dbo.OrderQueue', 'into @t']);

// ── Service Broker: SEND with body ────────────────────────────────────────
await t('send_with_body',
    `send on conversation @handle
     message type [//OrderService/NewOrder]
     (cast(@OrderXml as varbinary(max)));`,
    ['send on conversation', '//OrderService/NewOrder', 'cast(@OrderXml as varbinary(max))']);

// ── Service Broker: END CONVERSATION with ERROR ───────────────────────────
await t('end_conv_error',
    `end conversation @handle
     with error = 5001 description = 'Order processing failed';`,
    ['end conversation', 'error = 5001', "'Order processing failed'"]);

// ── WITHIN GROUP for STRING_AGG ───────────────────────────────────────────
await t('string_agg_within',
    `select string_agg(Name, ', ') within group (order by Name asc) as Names
     from dbo.Tags;`,
    ["string_agg(Name, ', ')", 'within group', 'order by Name asc']);

// ── AT TIME ZONE ──────────────────────────────────────────────────────────
await t('at_time_zone',
    `select OrderDate at time zone 'Eastern Standard Time' as EasternDate,
            OrderDate at time zone 'UTC' as UtcDate
     from dbo.Orders;`,
    ["at time zone 'Eastern Standard Time'", "at time zone 'UTC'"]);

// ── AT TIME ZONE chained ──────────────────────────────────────────────────
await t('at_time_zone_chained',
    `select OrderDate at time zone 'UTC' at time zone 'Pacific Standard Time' as PacificDate
     from dbo.Orders;`,
    ["at time zone 'UTC'", "at time zone 'Pacific Standard Time'"]);

// ── TRY_PARSE ─────────────────────────────────────────────────────────────
await t('try_parse_fn',
    `select try_parse('2024-01-15' as date using 'en-US') as Dt,
            try_parse('3.14' as decimal(10,4)) as Num
     from dbo.T;`,
    ["try_parse('2024-01-15' as date", "'en-US'", "try_parse('3.14' as decimal"]);

// ── PARSE ─────────────────────────────────────────────────────────────────
await t('parse_fn',
    `select parse('€1,234.56' as money using 'de-DE') from dbo.T;`,
    ["parse('€1,234.56' as money", "'de-DE'"]);

// ── Four-part linked server name ──────────────────────────────────────────
await t('four_part_name',
    `select * from LinkedServer.RemoteDb.dbo.Products where IsActive = 1;`,
    ['LinkedServer.RemoteDb.dbo.Products', 'IsActive = 1']);

// ── OPENDATASOURCE ────────────────────────────────────────────────────────
await t('opendatasource',
    `select * from opendatasource('SQLNCLI', 'Data Source=RemoteServer;Integrated Security=SSPI').AdventureWorks.HumanResources.Employee;`,
    ['opendatasource', "'SQLNCLI'", 'AdventureWorks.HumanResources.Employee']);

// ── ALTER TABLE: ADD CHECK CONSTRAINT ─────────────────────────────────────
await t('alter_add_check',
    `alter table dbo.Orders
     add constraint CK_Orders_Amount check (Amount > 0 and Amount < 1000000);`,
    ['add constraint CK_Orders_Amount', 'check (Amount > 0', 'Amount < 1000000']);

// ── ALTER TABLE: ADD FOREIGN KEY ──────────────────────────────────────────
await t('alter_add_fk',
    `alter table dbo.OrderLines
     add constraint FK_OrderLines_Orders foreign key (OrderId)
     references dbo.Orders (Id)
     on delete cascade on update no action;`,
    ['add constraint FK_OrderLines_Orders', 'foreign key (OrderId)',
     'references dbo.Orders (Id)', 'on delete cascade', 'on update no action']);

// ── ALTER TABLE: DROP CONSTRAINT ─────────────────────────────────────────
await t('alter_drop_constraint',
    `alter table dbo.Orders drop constraint CK_Orders_Amount;`,
    ['drop constraint CK_Orders_Amount']);

// ── ALTER TABLE: DROP COLUMN ──────────────────────────────────────────────
await t('alter_drop_column',
    `alter table dbo.Orders drop column OldNotes, DeprecatedFlag;`,
    ['drop column OldNotes', 'DeprecatedFlag']);

// ── SELECT FOR BROWSE ──────────────────────────────────────────────────────
await t('select_for_browse',
    `select Id, Name from dbo.Products for browse;`,
    ['for browse']);

// ── SELECT FOR READ ONLY ──────────────────────────────────────────────────
await t('select_for_read_only',
    `select Id from dbo.T for read only;`,
    ['for read only']);

// ── NEXT VALUE FOR (sequence) ─────────────────────────────────────────────
await t('next_value_for_insert',
    `insert into dbo.T (Id, Name) values (next value for dbo.MySeq, 'test');`,
    ['next value for dbo.MySeq']);

await t('next_value_for_select',
    `select next value for dbo.OrderSeq over (order by CreatedAt) as SeqNum, Id
     from dbo.Pending;`,
    // formatter may wrap over() args with spaces — check semantics only
    ['next value for dbo.OrderSeq', 'over', 'order by CreatedAt']);

// ── IIF ────────────────────────────────────────────────────────────────────
await t('iif_fn',
    `select iif(Amount > 0, 'Positive', 'Zero or Negative') as Sign,
            iif(IsActive = 1, Name, null) as ActiveName
     from dbo.T;`,
    ["iif(Amount > 0", "'Positive'", "'Zero or Negative'", "iif(IsActive = 1"]);

// ── CHOOSE ─────────────────────────────────────────────────────────────────
await t('choose_fn',
    `select choose(Status, 'Pending', 'Active', 'Completed', 'Cancelled') as StatusName
     from dbo.Orders;`,
    // formatter may wrap args with space after ( — check function and values
    ["choose", "Status", "'Pending'", "'Active'", "'Completed'", "'Cancelled'"]);

// ── FORMAT ────────────────────────────────────────────────────────────────
await t('format_fn',
    `select format(Amount, 'C2', 'en-US') as AmountFmt,
            format(OrderDate, 'yyyy-MM-dd') as DateFmt
     from dbo.Orders;`,
    ["format(Amount, 'C2'", "'en-US'", "format(OrderDate, 'yyyy-MM-dd')"]);

// ── DATEFROMPARTS / TIMEFROMPARTS ─────────────────────────────────────────
await t('date_from_parts',
    `select datefromparts(2024, 1, 15) as D,
            datetimefromparts(2024, 1, 15, 12, 0, 0, 0) as DT
     from dbo.T;`,
    ['datefromparts(2024, 1, 15)', 'datetimefromparts(2024, 1, 15, 12, 0, 0, 0)']);

// ── DATETRUNC (SQL Server 2022+) ───────────────────────────────────────────
await t('datetrunc_fn',
    `select datetrunc(month, OrderDate) as TruncMonth from dbo.Orders;`,
    ['datetrunc(month, OrderDate)']);

// ── GENERATE_SERIES (SQL Server 2022+) ────────────────────────────────────
await t('generate_series',
    `select value from generate_series(1, 10, 2);`,
    ['generate_series(1, 10, 2)']);

// ── sys.dm_exec_requests dynamic management view ─────────────────────────
await t('dmv_query',
    `select session_id, status, command, wait_type, wait_time
     from sys.dm_exec_requests
     where status <> 'background' and session_id > 50;`,
    ['sys.dm_exec_requests', "status <> 'background'", 'session_id > 50']);

// ── CROSS APPLY sys.dm_exec_sql_text ─────────────────────────────────────
await t('cross_apply_dmv',
    `select r.session_id, t.text
     from sys.dm_exec_requests r
     cross apply sys.dm_exec_sql_text(r.sql_handle) as t;`,
    ['sys.dm_exec_requests', 'cross apply sys.dm_exec_sql_text', 'r.sql_handle']);

// ── EXECUTE AS USER (session) ─────────────────────────────────────────────
await t('execute_as_user',
    `execute as user = 'ReportUser';
     select * from dbo.SensitiveData;
     revert;`,
    ["execute as user = 'ReportUser'", 'revert']);

// ── ALTER TABLE: ENABLE/DISABLE CONSTRAINT ────────────────────────────────
await t('disable_constraint',
    `alter table dbo.OrderLines nocheck constraint FK_OrderLines_Orders;`,
    ['nocheck constraint FK_OrderLines_Orders']);

await t('enable_constraint',
    `alter table dbo.OrderLines check constraint all;`,
    ['check constraint all']);

// ── WITH TIES ─────────────────────────────────────────────────────────────
await t('top_with_ties',
    `select top (5) with ties Id, Amount from dbo.Orders order by Amount desc;`,
    ['top (5) with ties', 'order by Amount desc']);

// ── TABLESAMPLE with seed ─────────────────────────────────────────────────
await t('tablesample_seed',
    `select * from dbo.Orders tablesample (1000 rows) repeatable (42);`,
    ['tablesample', '1000 rows', 'repeatable (42)']);

console.log(`\n${ok} passed, ${fail} failed`);
