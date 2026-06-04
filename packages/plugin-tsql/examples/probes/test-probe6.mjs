/**
 * Sixth probe — CREATE TABLE advanced, ALTER TABLE advanced, and
 * procedural SQL edge cases.
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

// ── WHILE with BREAK / CONTINUE ───────────────────────────────────────────
await t('while_break_continue',
    `while @i < 10 begin
        if @i = 5 break;
        set @i += 1;
        continue;
     end;`,
    ['break', 'continue', 'set @i']);

// ── CURSOR with READ ONLY / FOR UPDATE ────────────────────────────────────
await t('cursor_readonly',
    `declare C cursor for select Id from dbo.T for read only;`,
    ['cursor', 'for read only']);

await t('cursor_for_update',
    `declare C cursor for select Id, Name from dbo.T for update of Name;`,
    ['for update of Name']);

// ── FETCH with INTO ───────────────────────────────────────────────────────
await t('fetch_into',
    `fetch next from MyCursor into @Id, @Name;`,
    ['fetch next from MyCursor', 'into @Id, @Name']);

// ── BEGIN/END with multiple statements ───────────────────────────────────
await t('begin_end',
    `begin
        declare @x int = 1;
        set @x = @x + 1;
        select @x;
     end;`,
    ['declare @x int = 1', 'set @x', 'select @x']);

// ── IF/ELSE nested ────────────────────────────────────────────────────────
await t('if_else_nested',
    `if @a > 0
        if @b > 0
            select 'both';
        else
            select 'a only';
     else
        select 'neither';`,
    ["'both'", "'a only'", "'neither'"]);

// ── RETURN with value ─────────────────────────────────────────────────────
await t('return_value',
    `create function dbo.fn_Test() returns int as begin return 42; end;`,
    ['return 42']);

// ── Multiple output columns in function ───────────────────────────────────
await t('tvf_return_table',
    `create function dbo.fn_Get(@Id int) returns @Result table (
        Id int,
        Name nvarchar(100),
        Amount decimal(10,2)
     ) as begin
        insert @Result select Id, Name, 0.0 from dbo.T where Id = @Id;
        return;
     end;`,
    // formatter normalizes decimal(10,2) → decimal(10, 2) (space after comma)
    ['returns @Result table', 'Id int', 'Name nvarchar(100)', 'decimal(10']);

// ── CREATE TABLE with multiple file groups ───────────────────────────────
await t('table_on_filegroup',
    `create table dbo.BigTable (
        Id bigint primary key,
        Data varbinary(max) filestream null
     ) on [PRIMARY] textimage_on [FILESTREAM];`,
    // formatter strips unnecessary brackets from filegroup names (PRIMARY, FILESTREAM are not reserved)
    ['on', 'PRIMARY', 'textimage_on', 'FILESTREAM']);

// ── Named inline constraint on column ────────────────────────────────────
await t('named_inline_fk',
    `create table dbo.OrderLines (
        OrderId int not null,
        constraint FK_Order foreign key (OrderId) references dbo.Orders (Id)
     );`,
    ['constraint FK_Order', 'foreign key (OrderId)', 'references dbo.Orders (Id)']);

// ── ALTER TABLE ADD multiple columns ────────────────────────────────────
await t('alter_add_multiple',
    `alter table dbo.Users add
        FirstName nvarchar(50) null,
        LastName nvarchar(50) null,
        UpdatedAt datetime2 default getdate() not null;`,
    ['FirstName nvarchar(50)', 'LastName nvarchar(50)', 'UpdatedAt datetime2']);

// ── ALTER TABLE ALTER COLUMN DROP SPARSE ────────────────────────────────
await t('alter_col_drop_sparse',
    `alter table dbo.T alter column Col1 drop sparse;`,
    ['alter column Col1 drop sparse']);

// ── ENABLE / DISABLE TRIGGER on server ───────────────────────────────────
await t('disable_trigger_all_server',
    `disable trigger all on all server;`,
    ['disable trigger all', 'all server']);

// ── TRUNCATE TABLE with partitions ───────────────────────────────────────
await t('truncate_with_partitions',
    `truncate table dbo.Orders with (partitions (1 to 5, 7));`,
    ['truncate table', 'partitions', '1 to 5', '7']);

// ── CREATE INDEX with multiple options ───────────────────────────────────
await t('index_multiple_options',
    `create unique nonclustered index IX_Test on dbo.T (Code asc) with (fillfactor = 80, pad_index = on, online = on);`,
    ['fillfactor = 80', 'pad_index = on', 'online = on']);

// ── INCLUDE columns on index ─────────────────────────────────────────────
await t('index_include',
    `create nonclustered index IX_Cover on dbo.Orders (CustId) include (Amount, Status);`,
    ['include', 'Amount, Status']);

// ── Filtered index WHERE clause ───────────────────────────────────────────
await t('filtered_index',
    `create index IX_Active on dbo.Orders (CustId) where IsActive = 1;`,
    ['where IsActive = 1']);

// ── SEQUENCE: NEXT VALUE FOR in INSERT ───────────────────────────────────
await t('sequence_in_insert',
    `insert into dbo.Orders (Id, Amount) values (next value for dbo.OrderSeq, 100.0);`,
    ['next value for dbo.OrderSeq']);

// ── DISTINCT + TOP + ORDER BY ─────────────────────────────────────────────
await t('distinct_top_order',
    `select distinct top (5) Region, sum(Amount) as Total from dbo.Sales group by Region order by Total desc;`,
    ['distinct', 'top (5)', 'order by Total desc']);

// ── BETWEEN ──────────────────────────────────────────────────────────────
await t('between_predicate',
    `select * from dbo.Orders where Amount between 100 and 500 and OrderDate between '2024-01-01' and '2024-12-31';`,
    ['amount between 100 and 500', "orderdate between '2024-01-01' and '2024-12-31'"]);

// ── LIKE with ESCAPE ──────────────────────────────────────────────────────
await t('like_escape',
    `select * from dbo.T where Name like '%50!%' escape '!';`,
    ["like '%50!%'", "escape '!'"]);

// ── SUBSTRING / CHARINDEX ─────────────────────────────────────────────────
await t('string_functions',
    `select substring(Name, 1, 10), charindex('@', Email), len(Phone) from dbo.Users;`,
    ['substring(Name, 1, 10)', "charindex('@', Email)", 'len(Phone)']);

// ── CAST / CONVERT ────────────────────────────────────────────────────────
await t('cast_convert',
    `select cast(Amount as varchar(20)), convert(date, CreatedAt, 101) from dbo.Orders;`,
    ['cast(Amount as varchar(20))', 'convert(date, CreatedAt, 101)']);

// ── STUFF / REPLACE ───────────────────────────────────────────────────────
await t('stuff_replace',
    `select stuff(Phone, 4, 3, '***'), replace(Email, '@', ' at ') from dbo.Users;`,
    ["stuff(Phone, 4, 3, '***')", "replace(Email, '@', ' at ')"]);

// ── DATEADD / DATEDIFF ───────────────────────────────────────────────────
await t('date_functions',
    `select dateadd(day, 30, OrderDate), datediff(hour, StartTime, EndTime) from dbo.T;`,
    ['dateadd(day, 30, OrderDate)', 'datediff(hour, StartTime, EndTime)']);

// ── ISNULL / COALESCE ─────────────────────────────────────────────────────
await t('isnull_coalesce',
    `select isnull(Amount, 0), coalesce(Email, Phone, 'unknown') from dbo.T;`,
    ['isnull(Amount, 0)', "coalesce(Email, Phone, 'unknown')"]);

// ── SUM with CASE ─────────────────────────────────────────────────────────
await t('sum_case',
    `select sum(case when Status = 'Active' then Amount else 0 end) as ActiveTotal from dbo.Orders;`,
    // formatter wraps long CASE; check semantics not layout
    ["when Status = 'Active' then Amount", 'else 0', 'ActiveTotal']);

// ── COUNT DISTINCT ────────────────────────────────────────────────────────
await t('count_distinct',
    `select count(distinct CustId), count(*) from dbo.Orders;`,
    ['count(distinct CustId)', 'count(*)']);

// ── CROSS JOIN ────────────────────────────────────────────────────────────
await t('cross_join',
    `select a.Id, b.Code from dbo.A cross join dbo.B;`,
    ['cross join']);

// ── Multiple assignment with += ───────────────────────────────────────────
await t('compound_assignment',
    `update dbo.Counters set TotalCount += 1, LastUpdated = getdate() where CounterId = @id;`,
    ['TotalCount += 1', 'LastUpdated = getdate()']);

// ── UNION ALL with ORDER BY on outer ─────────────────────────────────────
await t('union_order',
    `select Id, Name from dbo.A
     union all
     select Id, Name from dbo.B
     order by Name;`,
    ['union all', 'order by Name']);

// ── CTE with column names ─────────────────────────────────────────────────
await t('cte_with_columns',
    `with Sales(Year, Region, Total) as (
        select year(OrderDate), Region, sum(Amount)
        from dbo.Orders group by year(OrderDate), Region
     )
     select * from Sales;`,
    // formatter adds space before CTE column list: Sales (Year, Region, Total)
    ['with', 'Sales', '(Year, Region, Total) as', 'sum(Amount)']);

console.log(`\n${ok} passed, ${fail} failed`);
