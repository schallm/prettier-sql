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

---

## DELETE

```sql
delete from dbo.Books
where
  in_stock = 0
  and published_date < dateadd(year, -10, getdate());
```

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

## CREATE PROCEDURE

Batch-isolating statements (`create procedure`, `create function`, `create view`) are automatically followed by `go`.

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

## CREATE FUNCTION

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
- `CREATE PROCEDURE`
- `CREATE FUNCTION`

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

## GO Batch Separators — expanded list

`CREATE OR ALTER PROCEDURE` is now also treated as batch-isolating and gets a `go` appended, matching the behaviour of `CREATE PROCEDURE`:

```sql
create or alter procedure dbo.GetBooks
  @genre_id int = null
as
begin
  select book_id, title, price
  from dbo.Books
  where genre_id = @genre_id or @genre_id is null;
end;
go
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

drop index ix_title on dbo.Books;
```

Multiple objects in one `DROP` are comma-separated on one line.

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

## Semicolons

All statements are terminated with a semicolon. The plugin normalises statements that are missing them.
