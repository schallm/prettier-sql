# Formatting Rules

This page documents how each SQL construct is formatted. All examples use the default options (`sqlKeywordCase: lower`, `sqlDensity: standard`, `sqlCommaStyle: trailing`).

The examples use a Books domain:

| Table | Key columns |
|---|---|
| `dbo.Books` | `book_id`, `title`, `author_id`, `publisher_id`, `genre_id`, `price`, `in_stock`, `published_date` |
| `dbo.Authors` | `author_id`, `first_name`, `last_name`, `country`, `publisher_id` |
| `dbo.Publishers` | `publisher_id`, `name`, `country` |
| `dbo.Genres` | `genre_id`, `name` |
| `dbo.Customers` | `customer_id`, `name`, `email`, `active` |
| `dbo.Orders` | `order_id`, `customer_id`, `total`, `order_date` |
| `dbo.OrderItems` | `order_item_id`, `order_id`, `book_id`, `quantity`, `unit_price` |

---

## SELECT

Column lists are always one column per line when there are multiple columns. A single column stays inline.

```sql
-- single column: stays inline
select book_id
from dbo.Books;

-- multiple columns: one per line
select
  b.book_id,
  b.title,
  b.price
from dbo.Books as b;
```

`SELECT DISTINCT` keeps `distinct` immediately after `select`:

```sql
select distinct genre_id
from dbo.Books;
```

### FROM and JOINs

Multiple tables or any join forces `from` onto its own line with the table list indented:

```sql
select b.book_id
from
  dbo.Books as b
  inner join dbo.Authors as a on b.author_id = a.author_id
  left join dbo.Publishers as p on b.publisher_id = p.publisher_id;
```

A single table with no joins stays inline with `from`:

```sql
select book_id, title
from dbo.Books;
```

Long `on` conditions that exceed `printWidth` wrap below the join line:

```sql
select *
from
  dbo.Books as b
  inner join dbo.Authors as a on
    b.author_id = a.author_id and b.publisher_id = a.publisher_id;
```

#### Nested (parenthesized) joins

A join whose right-hand side is itself a parenthesized join group opens a block after `join (`, indents the inner joins one level, and closes with `) on`:

```sql
select b.title
from
  dbo.Books as b
  left join (
    dbo.Authors as a
    inner join dbo.Publishers as p on a.publisher_id = p.publisher_id
  ) on b.author_id = a.author_id;
```

#### Table hints

`WITH (...)` hints are kept on the same line as the table reference:

```sql
select book_id
from dbo.Books as b with (nolock);
```

Multiple hints stay inline, comma-separated:

```sql
select book_id
from dbo.Books with (nolock, rowlock);
```

#### Table-valued functions (TVFs)

A TVF used as a row source in `from` is written as `schema.function(args)` with an optional alias:

```sql
select b.title, b.price
from dbo.GetAvailableBooks(1) as b;
```

TVFs can be joined like regular tables:

```sql
select b.title, g.name
from dbo.GetAvailableBooks(1) as b
  inner join dbo.Genres as g on b.genre_id = g.genre_id;
```

### WHERE

A single predicate stays inline with `where` (standard density):

```sql
select book_id
from dbo.Books
where in_stock = 1;
```

Multiple predicates each get their own line:

```sql
select book_id
from dbo.Books
where
  in_stock = 1
  and price < 50
  and genre_id in (1, 2, 3);
```

#### IN / NOT IN

Short value lists stay on one line with `in`:

```sql
select book_id
from dbo.Books
where genre_id in (1, 2, 3);
```

Long lists that would exceed `printWidth` wrap with each value on its own line:

```sql
select author_id
from dbo.Authors
where country in (
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany'
);
```

`not in` follows the same rule. Subquery form is indented like any other subquery:

```sql
select book_id
from dbo.Books
where book_id not in (
  select book_id
  from dbo.OrderItems
  where unit_price < 5
);
```

### GROUP BY / HAVING

```sql
select
  genre_id,
  count(*) as cnt,
  avg(price) as avg_price
from dbo.Books
group by genre_id
having count(*) > 5;
```

#### ROLLUP, CUBE, and GROUPING SETS

`rollup`, `cube`, and `grouping sets` are treated as keywords and respect `sqlKeywordCase`:

```sql
select
  genre_id,
  author_id,
  sum(price) as total
from dbo.Books
group by rollup(genre_id, author_id);
```

```sql
select
  genre_id,
  in_stock,
  count(*) as cnt
from dbo.Books
group by cube(genre_id, in_stock);
```

`grouping sets` supports composite groups `(col1, col2)` and the grand-total empty set `()`:

```sql
select
  genre_id,
  author_id,
  sum(price) as total
from dbo.Books
group by grouping sets((genre_id, author_id), (genre_id), ());
```

### ORDER BY

```sql
select book_id, title
from dbo.Books
order by published_date desc, title asc;
```

### CASE expressions

#### Searched CASE

Single-predicate `when` conditions stay inline:

```sql
select
  case
    when price > 50 then 'premium'
    when price > 20 then 'standard'
    else 'budget'
  end as price_tier
from dbo.Books;
```

When a `when` condition is a compound boolean expression (`and` / `or`), the predicates break to indented lines and `then` returns to the `when` indent level:

```sql
select case
  when
    author_id is not null
    and genre_id in (1, 2, 3)
  then 1
  else 0
end as is_featured
from dbo.Books;
```

#### Simple CASE

```sql
select
  case genre_id
    when 1 then 'Fiction'
    when 2 then 'Non-Fiction'
    else 'Other'
  end as genre_name
from dbo.Books;
```

### Expression functions

#### CAST and CONVERT

The full data type — including length, precision, and scale — is preserved and cased with the keyword setting:

```sql
select
  cast(title as nvarchar(100)),
  convert(decimal(10, 2), price, 1)
from dbo.Books;
```

`TRY_CAST` and `TRY_CONVERT` follow the same layout:

```sql
select
  try_cast(title as int),
  try_convert(decimal(10, 2), price)
from dbo.Books;
```

#### IIF

`iif` is formatted with its condition and two result expressions inline, comma-separated:

```sql
select iif(in_stock = 1, 'available', 'out of stock') as availability
from dbo.Books;
```

#### COALESCE and NULLIF

Arguments are comma-separated and stay inline when they fit within `printWidth`:

```sql
select
  coalesce(price, 0.00) as price,
  nullif(genre_id, 0) as genre_id
from dbo.Books;
```

#### AT TIME ZONE

The `at time zone` operator keeps the source expression and timezone string on one line:

```sql
select
  published_date at time zone 'UTC' as published_utc
from dbo.Books;
```

---

### UNION / UNION ALL

Each query branch is separated from the set operator by a blank line:

```sql
select book_id, title
from dbo.Books
where in_stock = 1

union all

select book_id, title
from dbo.ArchivedBooks;
```

`union` (distinct) follows the same pattern:

```sql
select author_id
from dbo.Books

union

select author_id
from dbo.ArchivedBooks;
```

### CTEs

Each CTE body is indented inside parentheses:

```sql
with available_books as (
  select
    book_id,
    title
  from dbo.Books
  where in_stock = 1
)
select b.title
from available_books as b
order by b.title asc;
```

### Window Functions

The `over(...)` clause wraps when it doesn't fit on one line:

```sql
select
  book_id,
  price,
  row_number() over (
    partition by genre_id
    order by price desc
  ) as rn
from dbo.Books;
```

### Derived tables

A subquery used as a table in the `from` clause is indented inside parentheses and aliased with `as`:

```sql
select t.genre_id, t.avg_price
from (
  select
    genre_id,
    avg(price) as avg_price
  from dbo.Books
  group by genre_id
) as t
where t.avg_price > 25;
```

### Subqueries

Subqueries inside `where` are indented inside parentheses:

```sql
select book_id, title
from dbo.Books
where book_id in (
  select book_id
  from dbo.OrderItems
  where unit_price > 50
);
```

---

## INSERT

Column list and values list are each indented:

```sql
insert into dbo.Customers (
  name,
  email,
  active
)
values
  ('Jane Smith', 'jane@example.com', 1);
```

Multiple rows stay on one line each (wrapping only if a single row exceeds `printWidth`):

```sql
insert into dbo.Genres (genre_id, name)
values
  (1, 'Fiction'),
  (2, 'Non-Fiction');
```

INSERT ... SELECT:

```sql
insert into dbo.ArchivedBooks (
  book_id,
  title
)
select
  book_id,
  title
from dbo.Books
where in_stock = 0;
```

INSERT with OUTPUT (see [OUTPUT clause](#output-clause) below):

```sql
insert into dbo.Books (title, price)
output inserted.book_id, inserted.title
values ('New Book', 9.99);
```

---

## UPDATE

```sql
update dbo.Books
set
  title = 'Updated Title',
  price = 29.99
where book_id = 42;
```

A single `set` assignment stays inline:

```sql
update dbo.Books
set in_stock = 0
where book_id = 42;
```

UPDATE with a JOIN uses a `from` clause:

```sql
update b
set b.in_stock = 0
from
  dbo.Books as b
  inner join dbo.Publishers as p on b.publisher_id = p.publisher_id
where p.country = 'UK';
```

UPDATE with OUTPUT:

```sql
update dbo.Books
set price = price * 1.1
output inserted.book_id, deleted.price, inserted.price
where in_stock = 1;
```

---

## DELETE

```sql
delete from dbo.Books
where
  in_stock = 0
  and published_date < dateadd(year, -10, getdate());
```

DELETE with OUTPUT INTO:

```sql
delete from dbo.Books
output deleted.book_id, deleted.title into @removed (book_id, title)
where in_stock = 0;
```

---

## MERGE

`merge into` targets the destination table (with an optional alias). `using` specifies the source, which can be a table or a subquery. Each `when` clause appears on its own line; the action is indented one level below `then`:

```sql
merge into dbo.Books as t
using dbo.ArchivedBooks as s
on t.book_id = s.book_id
when matched then
  update set
    t.title = s.title,
    t.price = s.price
when not matched by target then
  insert (book_id, title, price)
  values (s.book_id, s.title, s.price)
when not matched by source then
  delete;
```

An optional `and` predicate on a `when` clause stays inline with the condition keyword:

```sql
merge into dbo.Books as t
using dbo.ArchivedBooks as s
on t.book_id = s.book_id
when matched and t.price <> s.price then
  update set
    t.price = s.price;
```

A subquery source is indented inside parentheses:

```sql
merge into dbo.Books as t
using (
  select book_id, title, price
  from dbo.ArchivedBooks
  where price > 0
) as s
on t.book_id = s.book_id
when matched then
  update set
    t.title = s.title,
    t.price = s.price;
```

MERGE with OUTPUT:

```sql
merge into dbo.Books as t
using dbo.ArchivedBooks as s
on t.book_id = s.book_id
when matched then
  update set
    t.price = s.price
output $action, inserted.book_id, deleted.price;
```

---

## OUTPUT clause

`output` and `output into` are supported on INSERT, UPDATE, DELETE, and MERGE. The column list fits on one line when short; longer lists break with one column per line.

Short list — stays inline:

```sql
update dbo.Books
set price = price * 1.1
output inserted.book_id, deleted.price, inserted.price
where in_stock = 1;
```

Longer list with `into` — breaks to indented lines before `into`:

```sql
delete from dbo.Books
output
  deleted.book_id,
  deleted.title
into @removed (book_id, title)
where in_stock = 0;
```

`$action`, `inserted.*`, and `deleted.*` are preserved exactly as written since they are pseudo-columns, not SQL keywords (keyword casing does not apply to them).

---

## CREATE TABLE

Columns are indented inside parentheses, one per line. Constraints follow the columns:

```sql
create table dbo.Books (
  book_id int identity(1, 1) not null,
  title nvarchar(200) not null,
  price decimal(10, 2) not null,
  in_stock bit default 1 not null,
  constraint pk_books primary key (book_id)
);
```

With a foreign key:

```sql
create table dbo.Orders (
  order_id int identity(1, 1) not null,
  customer_id int not null,
  total decimal(18, 2) not null,
  constraint pk_orders primary key (order_id),
  constraint fk_orders_customers foreign key (customer_id) references dbo.Customers (customer_id)
);
```

---

## ALTER TABLE

```sql
-- Add column
alter table dbo.Books
add
  isbn nvarchar(20) null;

-- Drop column
alter table dbo.Books
drop column isbn;
```

---

## CREATE / ALTER PROCEDURE

`alter procedure` and `create or alter procedure` follow the same layout as `create procedure`.
All three are batch-isolating (automatically followed by `go`).

```sql
create procedure dbo.GetAvailableBooks
as
begin
  select
    book_id,
    title
  from dbo.Books
  where in_stock = 1;
end;
go
```

With parameters (each on its own indented line):

```sql
create procedure dbo.GetBookById
  @id int,
  @includeOutOfStock bit = 0
as
begin
  select book_id, title
  from dbo.Books
  where book_id = @id;
end;
go
```

Comments between the procedure name and the parameter list are preserved before the parameter list. Comments after the last parameter but before `as` are preserved after the parameter list:

```sql
create procedure dbo.GetBookById
  /* Returns a single book by its ID */
  @id int,
  @active bit = 1
  /* WITH ENCRYPTION */
as
begin
  select book_id, title
  from dbo.Books
  where book_id = @id;
end;
go
```

---

## CREATE / ALTER FUNCTION

`alter function` and `create or alter function` follow the same layout as `create function`.

Scalar function:

```sql
create function dbo.GetAuthorFullName(@first nvarchar(50), @last nvarchar(50))
returns nvarchar(101)
as
begin
  return @first + ' ' + @last;
end;
go
```

---

## CREATE / ALTER VIEW

```sql
create or alter view dbo.vw_available_books
as
select
  book_id,
  title
from dbo.Books
where in_stock = 1;
go
```

Block comments between the view name and `as` are preserved in place:

```sql
create or alter view dbo.vw_sensitive_prices
/* with encryption */
as
select book_id, price
from dbo.Books;
go
```

---

## Comments

### Trailing line comments

Line comments at the end of a statement or VALUES row are kept on the same line:

```sql
insert into dbo.Genres (genre_id, name)
values
  (1, 'Fiction'),   -- primary genre
  (2, 'Non-Fiction'); -- secondary genre
```

### Leading comments

Standalone comment lines before a statement are attached to that statement:

```sql
-- Returns all available books
select book_id, title
from dbo.Books
where in_stock = 1;
```

### Block comments

Block comments are preserved in their original relative position. A block comment before a statement appears before it in the output:

```sql
/* legacy view — do not remove */
create or alter view dbo.vw_legacy
as
select * from dbo.Books;
go
```

### Commented-out predicates

Line or block comments inside a `where` clause (e.g. a temporarily disabled predicate) are preserved between the surrounding predicates:

```sql
select book_id
from dbo.Books
where
  in_stock = 1
  -- and price < 50
  and genre_id = 1;
```

### Comments inside procedure bodies

Comments between statements inside a `begin`/`end` block are preserved in position:

```sql
create procedure dbo.ProcessBooks
as
begin
  -- Step 1: mark unavailable books
  update dbo.Books
  set in_stock = 0
  where published_date < '2000-01-01';

  -- Step 2: return the remaining stock
  select book_id, title
  from dbo.Books
  where in_stock = 1;
end;
go
```

---

## GO Batch Separators

The following statement types must be alone in a batch and automatically get a `go` appended:

- `CREATE VIEW` / `ALTER VIEW` / `CREATE OR ALTER VIEW`
- `CREATE PROCEDURE` / `ALTER PROCEDURE` / `CREATE OR ALTER PROCEDURE`
- `CREATE FUNCTION` / `ALTER FUNCTION` / `CREATE OR ALTER FUNCTION`
- `CREATE TRIGGER` / `ALTER TRIGGER`

When multiple such statements appear in a file (separated by `go` in the input), each batch is separated by a blank line in the output:

```sql
create or alter view dbo.vw_books
as
select book_id, title from dbo.Books;
go

create or alter view dbo.vw_authors
as
select author_id, first_name, last_name from dbo.Authors;
go
```

---

## USE

```sql
use AdventureWorks2019;
```

---

## SET statements

### SET option ON / OFF

`SET` on/off options are formatted as `set <option> on;` or `set <option> off;`. Keyword casing
applies to both the `SET` keyword and the option name.

```sql
set nocount on;
set ansi_nulls on;
set quoted_identifier on;
set xact_abort off;
```

### SET STATISTICS

```sql
set statistics io on;
set statistics time off;
```

### SET IDENTITY_INSERT

```sql
set identity_insert dbo.Books on;
set identity_insert dbo.Books off;
```

### SET TRANSACTION ISOLATION LEVEL

```sql
set transaction isolation level read committed;
set transaction isolation level snapshot;
set transaction isolation level serializable;
```

Supported levels: `READ COMMITTED`, `READ UNCOMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`, `SNAPSHOT`.

---

## WAITFOR

```sql
waitfor delay '00:00:05';
waitfor time '10:00:00';
```

---

## TRUNCATE TABLE

```sql
truncate table dbo.Books;
```

---

## DROP statements

```sql
drop table dbo.Books;
drop table if exists dbo.Books;

drop procedure dbo.GetBooks;
drop view dbo.vw_available_books;
drop function dbo.GetBookPrice;
drop trigger dbo.trg_Books_AI;
drop trigger if exists dbo.trg_Books_AI;

drop sequence dbo.OrderSeq;
drop sequence if exists dbo.OrderSeq;

drop index ix_title on dbo.Books;

drop user AppUser;
drop login AppLogin;
drop role if exists db_reader;
```

Multiple objects in one `DROP TABLE/PROCEDURE/VIEW/FUNCTION` are comma-separated on one line.

---

## Control flow: BREAK / CONTINUE / GOTO / label

```sql
while @i < 10
begin
  if @i = 5
    break;
  set @i = @i + 1;
  continue;
end;

goto exit_label;

exit_label:
```

Labels are emitted as-is (ScriptDom preserves the trailing colon in the value).

---

## THROW / RAISERROR

```sql
-- Re-throw inside a CATCH block
throw;

-- New-style throw with arguments
throw 50001, 'Book not found', 1;

-- Legacy RAISERROR
raiserror ('Book not found', 16, 1);
```

---

## TRY / CATCH

```sql
begin try
  insert into dbo.Books (title, price)
  values ('New Book', 29.99);
end try
begin catch
  throw;
end catch
```

---

## SELECT @var = expr (variable assignment in select list)

```sql
select @total = sum(price)
from dbo.Books
where in_stock = 1;
```

---

## Full-text predicates

### CONTAINS / FREETEXT

`contains` and `freetext` are formatted as inline function calls and treated as keywords (subject to `sqlKeywordCase`).

Single column — bare column name, no extra parentheses:

```sql
select book_id, title
from dbo.Books
where contains(title, '"SQL Server"');
```

Wildcard — all full-text indexed columns:

```sql
select book_id
from dbo.Books
where contains(*, 'programming');
```

Multiple columns — inner parentheses around the column list:

```sql
select book_id
from dbo.Books
where contains((title, author_id), 'design');
```

With `LANGUAGE`:

```sql
select book_id
from dbo.Books
where contains(title, 'query', language 1033);
```

`freetext` follows the same layout:

```sql
select book_id, title
from dbo.Books
where freetext(title, 'database programming');
```

### CONTAINSTABLE / FREETEXTTABLE

These table-valued functions appear in `FROM` / `JOIN` clauses and are formatted like other TVFs, with an alias:

```sql
select
  b.book_id,
  b.title,
  ft.rank
from
  dbo.Books as b
  inner join containstable(dbo.Books, title, '"SQL"') as ft on
    b.book_id = ft.key;
```

With wildcard and TOP N limit:

```sql
select
  b.book_id,
  ft.rank
from
  dbo.Books as b
  inner join freetexttable(dbo.Books, *, 'programming', 10) as ft on
    b.book_id = ft.key;
```

---

## Rowset functions (OPENJSON / OPENXML)

### OPENJSON

`OPENJSON` appears in `FROM` / `CROSS APPLY` clauses. Without a `WITH` clause, only the alias
is attached:

```sql
select
  j.key,
  j.value
from
  dbo.Orders as o
  cross apply openjson(o.json_data) as j;
```

With a row-path and `WITH` schema declaration, each column definition is on its own indented
line inside the parentheses:

```sql
select
  j.order_id,
  j.amount
from
  dbo.Orders as o
  cross apply openjson(o.json_data, '$.items')
  with (
    order_id int '$.id',
    amount decimal(10, 2) '$.amount',
    notes nvarchar(500) '$.notes'
  ) as j;
```

`AS JSON` columns are preserved:

```sql
select j.id, j.data
from openjson(@json)
with (
  id int '$.id',
  data nvarchar(max) '$.data' as json
) as j;
```

### OPENXML

`OPENXML` follows the same WITH-clause layout:

```sql
select
  x.id,
  x.name
from openxml(@hDoc, '/root/item', 2)
with (
  id int '@id',
  name varchar(100) 'name'
) as x;
```

The column data types inside `WITH (...)` are emitted as raw text (original casing is
preserved). `OPENROWSET` is not yet formatted and is emitted as-is.

---

---

## CREATE / ALTER TRIGGER

`create trigger` and `alter trigger` are batch-isolating (automatically followed by `go`).

The trigger name, `on` clause, timing/events, and body each appear on their own line:

```sql
create trigger dbo.trg_Books_AI
on dbo.Books
after insert
as
begin
  update dbo.Books
  set price = price * 1.1
  where book_id in (
    select book_id
    from inserted
  );
end;
go
```

Multiple DML events are comma-separated on the event line:

```sql
create trigger dbo.trg_Books_IUD
on dbo.Books
after insert, update, delete
as
begin
  print 'modified';
end;
go
```

`instead of` triggers use the same layout:

```sql
create trigger dbo.trg_Books_IOD
on dbo.Books
instead of update, delete
as
begin
  print 'blocked';
end;
go
```

---

## ALTER INDEX

`alter index` reformats the index name (or `all`), table, and operation on separate lines:

```sql
alter index ix_Books_title on dbo.Books
rebuild;

alter index all on dbo.Books
rebuild;

alter index ix_Books_title on dbo.Books
reorganize;

alter index ix_Books_title on dbo.Books
disable;
```

---

## DECLARE CURSOR / OPEN / FETCH / CLOSE / DEALLOCATE

`declare … cursor for` puts the cursor name and `cursor` keyword on the first line. The `for` keyword and the query each appear on their own line:

```sql
declare book_cursor cursor
for
select book_id, title
from dbo.Books
where in_stock = 1;
```

Cursor options (e.g. `SCROLL`, `READ_ONLY`) appear between the cursor name and the `cursor` keyword:

```sql
declare book_cursor scroll cursor
for
select book_id from dbo.Books;
```

The remaining cursor operations are single-line statements:

```sql
open book_cursor;

fetch next from book_cursor into @id, @title;
fetch prior from book_cursor;
fetch first from book_cursor into @id, @title;
fetch last from book_cursor into @id;

close book_cursor;
deallocate book_cursor;
```

---

## CREATE / ALTER SEQUENCE

Options each appear on their own line below the sequence name:

```sql
create sequence dbo.OrderSeq
as bigint
start with 1
increment by 1
minvalue 1
maxvalue 9999
cycle
cache 20;
```

`NO` variants are supported:

```sql
create sequence dbo.Seq
as int
start with 1
no minvalue
no maxvalue
no cycle
no cache;
```

`alter sequence` uses `restart with` (not `start with`):

```sql
alter sequence dbo.OrderSeq
restart with 100
increment by 5;
```

---

## BULK INSERT

```sql
bulk insert dbo.Books
from 'C:\data\books.csv';
```

With a `WITH` options block — each option on its own indented line:

```sql
bulk insert dbo.Books
from 'C:\data\books.csv'
with (
  fieldterminator = ',',
  rowterminator = '\n',
  firstrow = 2
);
```

---

## CREATE TYPE

### Scalar user-defined type (UDDT)

```sql
create type dbo.BookTitle from nvarchar(200) not null;
create type dbo.OptionalText from nvarchar(500) null;
```

The base data type — including length, precision, and scale — is preserved. Keyword casing applies to the type keyword itself (e.g. `nvarchar`, `int`).

### Table-valued parameter type (TVP)

The column list follows the same rules as `CREATE TABLE`:

```sql
create type dbo.BookList as table (
  book_id int not null,
  title nvarchar(200) not null,
  price decimal(10, 2)
);
```

---

## CREATE / ALTER / DROP USER

### CREATE USER

The `FOR`/`FROM`/`WITHOUT` clause goes on its own line. A `WITH` option list is indented one level:

```sql
create user AppUser
for login AppLogin;

create user SvcUser
without login;

create user AzureUser
from external provider;

create user AppUser
for login AppLogin
with
  default_schema = dbo;
```

### ALTER USER

```sql
alter user AppUser
with
  name = NewUser,
  default_schema = reports;
```

### DROP USER

```sql
drop user AppUser;
```

---

## CREATE / ALTER / DROP LOGIN

### CREATE LOGIN

The `WITH` or `FROM` clause starts on a new line. Options are indented one level, one per line:

```sql
create login AppLogin
with
  password = 'P@ssw0rd';

create login AppLogin
with
  password = 'P@ssw0rd',
  default_database = master,
  check_policy = on,
  check_expiration = on;

create login AppLogin
with
  password = 'P@ssw0rd' hashed must_change;

create login WindowsUser
from windows;

create login WindowsUser
from windows
with
  default_domain = CORP;
```

### ALTER LOGIN

```sql
alter login AppLogin enable;
alter login AppLogin disable;

alter login AppLogin
add credential BackupCred;

alter login AppLogin
drop credential BackupCred;

alter login AppLogin
with
  password = 'NewP@ss';

alter login AppLogin
with
  password = 'NewP@ss',
  old_password = 'OldP@ss';
```

### DROP LOGIN

```sql
drop login AppLogin;
```

---

## CREATE / ALTER / DROP ROLE

### CREATE ROLE

```sql
create role db_reader;

create role db_reader
authorization dbo;
```

### ALTER ROLE

```sql
alter role db_reader
add member AppUser;

alter role db_reader
drop member AppUser;

alter role db_reader
with name = db_reader_v2;
```

### DROP ROLE

```sql
drop role db_reader;
drop role if exists db_reader;
```

---

## Semicolons

All statements are terminated with a semicolon. The plugin normalises statements that are missing them.
