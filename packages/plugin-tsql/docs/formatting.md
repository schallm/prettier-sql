# Formatting Rules

This page documents how each SQL construct is formatted. All examples use the default options (`sqlKeywordCase: lower`, `sqlDensity: standard`, `sqlCommaStyle: trailing`).

The examples use a Books domain:

| Table        | Key columns                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| `Books`      | `Id`, `Title`, `AuthorId`, `PublisherId`, `GenreId`, `Price`, `InStock`, `PublishedDate` |
| `Authors`    | `Id`, `FirstName`, `LastName`, `Country`, `PublisherId`                                  |
| `Publishers` | `Id`, `Name`, `Country`                                                                  |
| `Genres`     | `Id`, `Name`                                                                             |
| `Customers`  | `Id`, `Name`, `Email`, `Active`                                                          |
| `Orders`     | `Id`, `CustomerId`, `Total`, `OrderDate`                                                 |
| `OrderItems` | `Id`, `OrderId`, `BookId`, `Quantity`, `UnitPrice`                                       |

---

## DML

### SELECT

Column lists are always one column per line when there are multiple columns. A single column stays inline.

```sql
-- single column: stays inline
select Id
from Books;

-- multiple columns: one per line
select
    Id,
    Title,
    Price
from Books;
```

`SELECT DISTINCT` keeps `distinct` immediately after `select`:

```sql
select distinct GenreId
from Books;
```

#### FROM and JOINs

Multiple tables or any join forces `from` onto its own line with the table list indented:

```sql
select *
from
    Books
    inner join Authors on Books.AuthorId = Authors.Id
    left join Publishers on Books.PublisherId = Publishers.Id;
```

A single table with no joins stays inline with `from`:

```sql
select
    Id,
    Title
from Books;
```

Long `on` conditions that exceed `printWidth` wrap below the join line:

```sql
select *
from
    Books
    inner join Authors on
        Books.AuthorId = Authors.Id
        and Books.PublisherId = Authors.PublisherId;
```

##### Nested (parenthesized) joins

A join whose right-hand side is itself a parenthesized join group opens a block after `join (`, indents the inner joins one level, and closes with `) on`:

```sql
select Title
from
    Books
    left join (
        Authors
        inner join Publishers on Authors.PublisherId = Publishers.Id
    ) on Books.AuthorId = Authors.Id;
```

##### Table hints

`WITH (...)` hints are kept on the same line as the table reference:

```sql
select Id
from Books with (nolock);
```

Multiple hints stay inline, comma-separated:

```sql
select Id
from Books with (nolock, rowlock);
```

##### Table-valued functions (TVFs)

A TVF used as a row source in `from` is written as `schema.function(args)` with an optional alias:

```sql
select
    Title,
    Price
from dbo.GetAvailableBooks(1);
```

TVFs can be joined like regular tables:

```sql
select
    Title,
    Genres.Name
from
    dbo.GetAvailableBooks(1) as b
    inner join Genres on b.GenreId = Genres.Id;
```

#### WHERE

A single predicate stays inline with `where` (standard density):

```sql
select Id
from Books
where InStock = 1;
```

Multiple predicates each get their own line:

```sql
select Id
from Books
where
    InStock = 1
    and Price < 50
    and GenreId in (1, 2, 3);
```

##### IN / NOT IN

Short value lists stay on one line with `in`:

```sql
select Id
from Books
where GenreId in (1, 2, 3);
```

Long lists that would exceed `printWidth` wrap with each value on its own line:

```sql
select Id
from Authors
where Country in ('United States', 'United Kingdom', 'Canada', 'Australia', 'Germany');
```

`not in` follows the same rule. Subquery form is indented like any other subquery:

```sql
select Id
from Books
where Id not in (
    select BookId
    from OrderItems
    where UnitPrice < 5
);
```

##### ANY / ALL subquery predicates

`ANY` and `ALL` compare a scalar expression against every row returned by a subquery. The subquery is indented inside parentheses, exactly like a subquery in `IN`:

```sql
select Id
from Books
where Price > all (
    select Price
    from ArchivedBooks
);
```

```sql
select Id
from Books
where Price > any (
    select Price
    from ArchivedBooks
    where InStock = 1
);
```

#### GROUP BY / HAVING

```sql
select
    GenreId,
    count(*) as BookCount,
    avg(Price) as AvgPrice
from Books
group by GenreId
having count(*) > 5;
```

##### ROLLUP, CUBE, and GROUPING SETS

`rollup`, `cube`, and `grouping sets` are treated as keywords and respect `sqlKeywordCase`:

```sql
select
    GenreId,
    AuthorId,
    sum(Price) as Total
from Books
group by rollup(GenreId, AuthorId);
```

```sql
select
    GenreId,
    InStock,
    count(*) as BookCount
from Books
group by cube(GenreId, InStock);
```

`grouping sets` supports composite groups `(col1, col2)` and the grand-total empty set `()`:

```sql
select
    GenreId,
    AuthorId,
    sum(Price) as Total
from Books
group by grouping sets((GenreId, AuthorId), (GenreId), ());
```

#### ORDER BY

```sql
select
    Id,
    Title
from Books
order by
    PublishedDate desc,
    Title asc;
```

#### CASE expressions

##### Searched CASE

Single-predicate `when` conditions stay inline:

```sql
select
    case
        when Price > 50 then 'premium'
        when Price > 20 then 'standard'
        else 'budget'
    end as PriceTier
from Books;
```

When a `when` condition is a compound boolean expression (`and` / `or`), the predicates break to indented lines and `then` returns to the `when` indent level:

```sql
select
    case
        when
            AuthorId is not null
            and GenreId in (1, 2, 3)
        then 1
        else 0
    end as IsFeatured
from Books;
```

##### Simple CASE

```sql
select
    case GenreId
        when 1 then 'Fiction'
        when 2 then 'Non-Fiction'
        else 'Other'
    end as GenreName
from Books;
```

#### Expression functions

##### CAST and CONVERT

The full data type — including length, precision, and scale — is preserved and cased with the keyword setting:

```sql
select
    cast(Title as nvarchar(100)),
    convert(decimal(10, 2), Price, 1)
from Books;
```

`TRY_CAST` and `TRY_CONVERT` follow the same layout:

```sql
select
    try_cast(Title as int),
    try_convert(decimal(10, 2), Price)
from Books;
```

##### IIF

`iif` is formatted with its condition and two result expressions inline, comma-separated:

```sql
select iif(InStock = 1, 'available', 'out of stock') as availability
from Books;
```

##### COALESCE and NULLIF

Arguments are comma-separated and stay inline when they fit within `printWidth`:

```sql
select
    coalesce(Price, 0.00) as Price,
    nullif(GenreId, 0) as GenreId
from Books;
```

##### TRIM with FROM

`TRIM(chars FROM str)` — trimming a specific character set — preserves the `FROM` keyword inline:

```sql
select trim(nchar(12288) from @str);
```

Inside a function body the result formats like any scalar expression:

```sql
create function dbo.TrimCharsFrom(@str nvarchar(max)) returns nvarchar(max)
as
begin
  return trim(nchar(12288) from @str);
end;
go
```

##### AT TIME ZONE

The `at time zone` operator keeps the source expression and timezone string on one line:

```sql
select PublishedDate at time zone 'UTC' as PublishedUtc
from Books;
```

##### PARSE and TRY_PARSE

`PARSE` and `TRY_PARSE` use `AS datatype [USING culture]` inline:

```sql
select parse('2023-01-01' as date);

select try_parse('abc' as int);

select parse('3.14' as decimal(10, 2) using 'en-US');
```

##### NEXT VALUE FOR

Sequence value expressions stay inline; `OVER` follows when present:

```sql
select next value for dbo.OrderSeq;

select next value for dbo.OrderSeq over (order by Id asc);
```

##### WITHIN GROUP

Ordered-set aggregates append `WITHIN GROUP (ORDER BY …)` on the same line. When `OVER` is also present (e.g. `PERCENTILE_CONT`), it follows after:

```sql
select string_agg(Name, ', ') within group (order by Name asc)
from Authors;

select percentile_cont(0.5) within group (order by Salary asc) over (partition by Department)
from Employees;
```

#### TOP

`TOP (n)`, `TOP (n) PERCENT`, and `TOP (n) WITH TIES` stay inline with `SELECT`:

```sql
select top (10)
    Id,
    Title
from Books
order by Price desc;

select top (10) percent
    Id,
    Title
from Books
order by Price desc;

select top (10) with ties
    Id,
    Title,
    Price
from Books
order by Price desc;
```

#### PIVOT and UNPIVOT

`PIVOT` and `UNPIVOT` indent the aggregate and `FOR … IN` clause inside the parentheses:

```sql
select *
from Sales
pivot (
    sum(Amount)
    for Quarter in ([Q1], [Q2], [Q3], [Q4])
) as PivotTable;

select *
from PivotedSales
unpivot (
    Amount for Quarter in (Q1, Q2, Q3, Q4)
) as UnpivotTable;
```

#### TABLESAMPLE

`TABLESAMPLE` follows the table name (after any alias):

```sql
select *
from BigTable tablesample (10 percent);

select *
from BigTable tablesample system (1000 rows) repeatable (42);
```

#### FOR SYSTEM_TIME (Temporal tables)

Temporal clause follows the table name:

```sql
select
    Id,
    Name
from dbo.Employee for system_time as of '2023-01-01';

select
    Id,
    Name
from dbo.Employee for system_time between '2022-01-01' and '2023-01-01';

select
    Id,
    Name
from dbo.Employee for system_time contained in ('2022-01-01', '2023-01-01');
```

#### FOR XML / FOR JSON

`FOR XML` and `FOR JSON` appear as the last clause, inline on their own line after the query:

```sql
select
    Id,
    Title,
    Price
from Books
for xml path('Book'), root('Books'), type;

select
    Id,
    Title as name,
    Price as price
from Books
for json path, root('Books'), include_null_values;
```

#### UNION / UNION ALL

Each query branch is separated from the set operator by a blank line:

```sql
select
    Id,
    Title
from Books
where InStock = 1

union all

select
    Id,
    Title
from ArchivedBooks;
```

`union` (distinct) follows the same pattern:

```sql
select AuthorId
from Books

union

select AuthorId
from ArchivedBooks;
```

#### CTEs

Each CTE body is indented inside parentheses:

```sql
with availableBooks as (
    select
        Id,
        Title
    from Books
    where InStock = 1
)
select Title
from availableBooks
order by Title asc;
```

#### Window Functions

The `over(...)` clause wraps when it doesn't fit on one line:

```sql
select
    Id,
    Price,
    row_number() over (
        partition by GenreId
        order by Price desc
    ) as rn
from Books;
```

#### Derived tables

A subquery used as a table in the `from` clause is indented inside parentheses and aliased with `as`:

```sql
select
    GenreId,
    AvgPrice
from (
    select
        GenreId,
        avg(Price) as AvgPrice
    from Books
    group by GenreId
) as t
where AvgPrice > 25;
```

#### Inline VALUES derived table

A `VALUES(...)` constructor used as a derived table in `FROM` is formatted inline when it fits within `printWidth`, or broken across lines when it exceeds it. The alias and column list follow with no space between the alias name and the column list:

```sql
-- fits on one line: stays inline
select
  v.Id,
  v.Name
from (values (1, 'Alice'), (2, 'Bob')) as v(Id, Name);
```

```sql
-- exceeds printWidth: rows break onto their own indented lines
select
  v.ProductId,
  v.Name,
  v.Price
from (values
  (101, 'Widget Pro', 29.99),
  (102, 'Gadget Plus', 49.99),
  (103, 'Doohickey', 9.99)
) as v(ProductId, Name, Price)
where v.Price < 40;
```

#### Subqueries

Subqueries inside `where` are indented inside parentheses:

```sql
select
    Id,
    Title
from Books
where Id in (
    select BookId
    from OrderItems
    where UnitPrice > 50
);
```

#### Full-text predicates

##### CONTAINS / FREETEXT

`contains` and `freetext` are formatted as inline function calls and treated as keywords (subject to `sqlKeywordCase`).

Single column — bare column name, no extra parentheses:

```sql
select
    Id,
    Title
from Books
where contains(Title, '"SQL Server"');
```

Wildcard — all full-text indexed columns:

```sql
select Id
from Books
where contains(*, 'programming');
```

Multiple columns — inner parentheses around the column list:

```sql
select Id
from Books
where contains((Title, AuthorId), 'design');
```

With `LANGUAGE`:

```sql
select Id
from Books
where contains(Title, 'query', language 1033);
```

`freetext` follows the same layout:

```sql
select
    Id,
    Title
from Books
where freetext(Title, 'database programming');
```

##### CONTAINSTABLE / FREETEXTTABLE

These table-valued functions appear in `FROM` / `JOIN` clauses and are formatted like other TVFs, with an alias:

```sql
select
  Books.Id,
  Books.Title,
  ft.rank
from
  Books
  inner join containstable(Books, Title, '"SQL"') as ft on
    Books.Id = ft.key;
```

With wildcard and TOP N limit:

```sql
select
  Books.Id,
  ft.rank
from
  Books
  inner join freetexttable(Books, *, 'programming', 10) as ft on
    Books.Id = ft.key;
```

#### Rowset functions (OPENJSON / OPENXML / OPENROWSET)

##### OPENJSON

`OPENJSON` appears in `FROM` / `CROSS APPLY` clauses. Without a `WITH` clause, only the alias
is attached:

```sql
select
  j.key,
  j.value
from
  Orders
  cross apply openjson(JsonData) as j;
```

With a row-path and `WITH` schema declaration, `WITH (` opens on the same line as `OPENJSON`
and each column definition is on its own indented line:

```sql
select
    j.OrderId,
    j.amount
from
    Orders
    cross apply openjson(JsonData, '$.items') with (
        OrderId int '$.Id',
        amount decimal(10, 2) '$.amount',
        notes nvarchar(500) '$.notes'
    ) as j;
```

`AS JSON` columns are preserved:

```sql
select
    Id,
    data
from openjson(@json) with (
    Id int '$.Id',
    data nvarchar(max) '$.data' as json
);
```

##### OPENXML

`OPENXML` follows the same layout — `WITH (` on the same line as `OPENXML`:

```sql
select
    Id,
    Name
from openxml(@hDoc, '/root/item', 2) with (
    Id int '@Id',
    Name varchar(100) 'Name'
);
```

The column data types inside `WITH (...)` are emitted as raw text (original casing is
preserved).

##### OPENROWSET — provider form

`OPENROWSET` with an OLE DB provider name and a query string or remote object:

```sql
-- Single provider-string connection — breaks across lines when too long for printWidth
select
    Id,
    Name
from openrowset('SQLNCLI', 'Server=(local);Trusted_Connection=yes;', 'select Id, Name from pubs..titles');

-- Three-part datasource;userid;password connection with a schema object
select *
from openrowset('SQLNCLI', 'server=(local)';'sa';'pass', pubs.titles);
```

The three arguments (provider name, connection, query/object) each break to their own indented
line when the call does not fit within `printWidth`; they stay inline when it does. All SQL
keywords (`OPENROWSET`, `AS`) are subject to the `sqlKeywordCase` option.

##### OPENROWSET — BULK form

`OPENROWSET(BULK ...)` for importing file data:

```sql
-- All arguments break together when the call exceeds printWidth
select *
from openrowset(bulk 'C:\data\file.csv', formatfile='C:\data\fmt.xml', firstrow=2) as t;

-- Stays inline when short enough
select *
from openrowset(bulk 'C:\data\data.json', single_blob) as t;
```

Options are emitted as raw text (original casing preserved). The `BULK` keyword respects
`sqlKeywordCase`.

#### SELECT @var = expr

Variable assignment in the select list:

```sql
select @total = sum(Price)
from Books
where InStock = 1;
```

---

### INSERT

The column list stays inline when it fits; it wraps to indented lines only when it would exceed `printWidth`. The values list is always indented:

```sql
insert into Customers (Name, Email, Active)
values
    ('Jane Smith', 'jane@example.com', 1);
```

Multiple rows stay on one line each (wrapping only if a single row exceeds `printWidth`):

```sql
insert into Genres (Id, Name)
values
    (1, 'Fiction'),
    (2, 'Non-Fiction');
```

INSERT ... SELECT:

```sql
insert into ArchivedBooks (Id, Title)
select
    Id,
    Title
from Books
where InStock = 0;
```

INSERT with OUTPUT (see [OUTPUT clause](#output-clause) below):

```sql
insert into Books (Title, Price)
output inserted.Id, inserted.Title
values
    ('New Book', 9.99);
```

---

### UPDATE

```sql
update Books
set
    Title = 'Updated Title',
    Price = 29.99
where Id = 42;
```

A single `set` assignment stays inline:

```sql
update Books
set InStock = 0
where Id = 42;
```

UPDATE with a JOIN uses a `from` clause:

```sql
update Books
set InStock = 0
from
    Books
    inner join Publishers on Books.PublisherId = Publishers.Id
where Publishers.Country = 'UK';
```

UPDATE with OUTPUT:

```sql
update Books
set Price = Price * 1.1
output inserted.Id, deleted.Price, inserted.Price
where InStock = 1;
```

---

### DELETE

```sql
delete from Books
where
    InStock = 0
    and PublishedDate < dateadd(year, -10, getdate());
```

DELETE with OUTPUT INTO:

```sql
delete from Books
output
    deleted.Id,
    deleted.Title
into @removed (Id, Title)
where InStock = 0;
```

---

### MERGE

`merge into` targets the destination table. `using` specifies the source, which can be a table or a subquery. The `on` condition follows `using` on the same line (matching JOIN behaviour): a single predicate stays inline; multiple predicates break to indented lines below. Each `when` clause appears on its own line; the action is indented one level below `then`:

```sql
merge into Books
using ArchivedBooks on Books.Id = ArchivedBooks.Id
when matched then
    update set
        Title = ArchivedBooks.Title,
        Price = ArchivedBooks.Price
when not matched by target then
    insert (Id, Title, Price)
    values (ArchivedBooks.Id, ArchivedBooks.Title, ArchivedBooks.Price)
when not matched by source then
    delete;
```

When the `on` condition has multiple predicates they break to indented lines:

```sql
merge into Books
using ArchivedBooks on
    Books.Id = ArchivedBooks.Id
    and Books.Name = ArchivedBooks.Name
when matched then
    update set Price = ArchivedBooks.Price;
```

An optional `and` predicate on a `when` clause stays inline with the condition keyword:

```sql
merge into Books
using ArchivedBooks on Books.Id = ArchivedBooks.Id
when matched and Books.Price <> ArchivedBooks.Price then
    update set Price = ArchivedBooks.Price;
```

A subquery source is indented inside parentheses:

```sql
merge into Books
using (
    select
        Id,
        Title,
        Price
    from ArchivedBooks
    where Price > 0
) as src on Books.Id = src.Id
when matched then
    update set
        Title = src.Title,
        Price = src.Price;
```

MERGE with OUTPUT:

```sql
merge into Books
using ArchivedBooks on Books.Id = ArchivedBooks.Id
when matched then
    update set Price = ArchivedBooks.Price
output $action, inserted.Id, deleted.Price;
```

---

### OUTPUT clause

`output` and `output into` are supported on INSERT, UPDATE, DELETE, and MERGE. The column list fits on one line when short; longer lists break with one column per line.

Short list — stays inline:

```sql
update Books
set Price = Price * 1.1
output inserted.Id, deleted.Price, inserted.Price
where InStock = 1;
```

Longer list with `into` — breaks to indented lines before `into`:

```sql
delete from Books
output
    deleted.Id,
    deleted.Title
into @removed (Id, Title)
where InStock = 0;
```

`$action`, `inserted.*`, and `deleted.*` are preserved exactly as written since they are pseudo-columns, not SQL keywords (keyword casing does not apply to them).

---

## DDL

### CREATE TABLE

Columns are indented inside parentheses, one per line. Constraints follow the columns:

```sql
create table Books (
    Id int identity(1, 1) not null,
    Title nvarchar(200) not null,
    Price decimal(10, 2) not null,
    InStock bit default 1 not null,
    constraint PK_Books primary key (Id)
);
```

Column lists in `PRIMARY KEY` and `UNIQUE` constraints stay on one line when they fit. When the constraint line exceeds `printWidth`, the constraint name becomes the header line and the key clause wraps to an indented line. When the column list itself is also too long, it breaks one column per line:

```sql
create table OrderItems (
    Id int not null,
    OrderId int not null,
    ProductId int not null,
    WarehouseId int not null,
    constraint PK_OrderItems primary key (OrderId, ProductId, WarehouseId)
);
```

With a foreign key:

```sql
create table Orders (
    Id int identity(1, 1) not null,
    CustomerId int not null,
    Total decimal(18, 2) not null,
    constraint PK_Orders primary key (Id),
    constraint FK_Orders_Customers foreign key (CustomerId) references Customers (Id)
);
```

`foreign key (cols) references table (cols)` is treated as a single unit and kept on one line when it fits. When the combined line is too long, `references` indents one extra level below `foreign key`. `on delete` and `on update` referential actions each appear on their own line at the same indent level as `foreign key`:

```sql
create table OrderItems (
    Id int not null,
    OrderId int not null,
    constraint FK_OrderItems_Orders
        foreign key (OrderId) references dbo.VeryLongSchemaName_Orders (OrderId)
        on delete cascade
        on update no action
);
```

Computed columns use `AS`:

```sql
create table OrderItems (
    Id int identity(1, 1) not null,
    Quantity int not null,
    UnitPrice decimal(10, 2) not null,
    LineTotal as Quantity * UnitPrice,
    constraint PK_OrderItems primary key (Id)
);
```

`WITH` options appear on the line after the closing parenthesis. Multiple options stay on one line unless they exceed `printWidth`, in which case each wraps to its own line:

```sql
create table ArchivedOrders (
    Id int not null,
    constraint PK_ArchivedOrders primary key (Id)
)
with (data_compression = page);

create table BigData (
    Id int not null,
    constraint PK_BigData primary key (Id)
)
with (data_compression = row, memory_optimized = off);
```

---

### ALTER TABLE

**ADD / DROP COLUMN**

```sql
alter table Books
add Isbn nvarchar(20) null;

alter table Books
drop column Isbn;
```

When dropping multiple columns, names stay on one line when they fit; otherwise they wrap one per line:

```sql
alter table Books
drop column Isbn, Summary;

alter table dbo.OrderItems
drop column VeryLongColumnNameA, VeryLongColumnNameB, VeryLongColumnNameC;
```

**ADD / DROP CONSTRAINT**

```sql
alter table Books
add constraint CK_Books_Price check (Price > 0);

alter table Orders
add constraint FK_Orders_Customers foreign key (CustomerId) references Customers (Id) on delete cascade;

alter table Books
drop constraint UQ_Books_Isbn;

alter table Books
drop constraint if exists CK_Books_Price;
```

When dropping multiple constraints, names wrap the same way as columns:

```sql
alter table dbo.OrderItems
drop constraint if exists FK_OrderItems_Products, FK_OrderItems_Orders, FK_OrderItems_Coupons;
```

**CHECK / NOCHECK CONSTRAINT**

Enables or disables constraint enforcement. Use `all` to target every constraint on the table, or list specific names (wrapping at `printWidth`):

```sql
alter table Orders
check constraint all;

alter table Orders
nocheck constraint FK_Orders_Customers;

alter table Orders
check constraint FK_Orders_Customers, CK_Orders_Total;
```

**ALTER COLUMN**

```sql
alter table Books
alter column Price decimal(12, 2) not null;
```

---

### CREATE COLUMNSTORE INDEX

`CREATE [CLUSTERED | NONCLUSTERED] COLUMNSTORE INDEX` follows the same header layout as `CREATE INDEX`. Columns (for nonclustered) appear inline in parentheses when short, wrapping at `printWidth`. An optional `WHERE` filter and `WITH (...)` options block each go on their own line:

```sql
create clustered columnstore index cci
on dbo.Orders;

create nonclustered columnstore index ncci
on dbo.Orders (CustomerId, OrderDate, Total);

create nonclustered columnstore index ncci_filtered
on dbo.Orders (CustomerId, OrderDate)
where Status = 'Closed'
with (drop_existing = on);
```

---

### CREATE INDEX

`CREATE INDEX` places the index name on the first line. `ON table (columns)` and the optional `INCLUDE` clause are each indented one level as sub-clauses of the statement. Each column includes an explicit `ASC` or `DESC` direction. The `INCLUDE` column list wraps at `printWidth`.

```sql
create nonclustered index IX_Books_Title
    on Books (
        Title asc
    );

create unique clustered index IX_Books_Id
    on Books (
        Id asc
    );

create nonclustered index IX_Books_AuthorId_Price
    on Books (
        AuthorId asc,
        Price desc
    )
    include (Title, InStock);

create nonclustered index IX_Books_Covering
    on Books (
        AuthorId asc
    )
    include (Title, Price, InStock, PublishedDate, GenreId);
```

---

### ALTER INDEX

`alter index` formats the index name (or `all`), table, and operation on a single line:

```sql
alter index IX_Books_Title on Books rebuild;

alter index all on Books rebuild;

alter index IX_Books_Title on Books reorganize;

alter index IX_Books_Title on Books disable;
```

---

### DROP statements

```sql
drop table Books;

drop table if exists Books;

drop procedure GetBooks;

drop view AvailableBooksView;

drop function GetBookPrice;

drop trigger BooksAfterInsertTrigger;

drop trigger if exists BooksAfterInsertTrigger;

drop sequence OrderSeq;

drop sequence if exists OrderSeq;

drop index IX_Books_Title on Books;

drop synonym dbo.MyAlias;

drop synonym if exists dbo.MyAlias;

drop schema sales;

drop schema if exists sales;

drop user AppUser;

drop login AppLogin;

drop role if exists db_reader;
```

Multiple objects in one `DROP TABLE/PROCEDURE/VIEW/FUNCTION/SYNONYM` are comma-separated on one line.

---

### CREATE / ALTER PROCEDURE

`alter procedure` and `create or alter procedure` follow the same layout as `create procedure`.
All three are batch-isolating (automatically followed by `go`).

```sql
create procedure GetAvailableBooks
as
begin
    select
        Id,
        Title
    from Books
    where InStock = 1;
end;
go
```

With parameters (each on its own indented line):

```sql
create procedure GetBookById
    @Id int,
    @IncludeOutOfStock bit = 0
as
begin
    select
        Id,
        Title
    from Books
    where Id = @Id;
end;
go
```

Comments between the procedure name and the parameter list are preserved before the parameter list. Comments after the last parameter but before `as` are preserved after the parameter list:

```sql
create procedure GetBookById
/* Returns a single book by its ID */
    @Id int,
    @Active bit = 1
/* WITH ENCRYPTION */
as
begin
    select
        Id,
        Title
    from Books
    where Id = @Id;
end;
go
```

---

### CREATE / ALTER FUNCTION

`alter function` and `create or alter function` follow the same layout as `create function`.

The parameter list wraps to indented lines only when it would exceed `printWidth`; `returns` always appears inline after the closing `)`.

Scalar function:

```sql
create function GetAuthorFullName(@First nvarchar(50), @Last nvarchar(50)) returns nvarchar(101)
as
begin
    return @First + ' ' + @Last;
end;
go
```

Inline table-valued function (`RETURNS TABLE`): uses `RETURN (query)` — no `BEGIN`/`END`:

```sql
create function GetBooksByGenre(@GenreId int) returns table
as
return (
    select
        Id,
        Title,
        Price
    from Books
    where
        GenreId = @GenreId
        and InStock = 1
);
go
```

Multi-statement table-valued function: return table declaration inline after `)`, body in `BEGIN`/`END`:

```sql
create function GetTopBooks(@MaxPrice decimal(10, 2)) returns @result table (
    Id int not null,
    Title nvarchar(200) not null,
    Price decimal(10, 2) not null
)
as
begin
    insert into @result
    select
        Id,
        Title,
        Price
    from Books
    where Price <= @MaxPrice
    order by Price asc;

    return;
end;
go
```

---

### CREATE / ALTER VIEW

```sql
create or alter view AvailableBooksView
as
select
    Id,
    Title
from Books
where InStock = 1;
go
```

Block comments between the view name and `as` are preserved in place:

```sql
create or alter view SensitivePricesView
/* with encryption */
as
select
    Id,
    Price
from Books;
go
```

---

### ENABLE / DISABLE TRIGGER

`ENABLE TRIGGER` and `DISABLE TRIGGER` put the trigger list (or `ALL`) inline, then `ON` with the target on the next line:

```sql
enable trigger tr1
on dbo.Orders;

enable trigger tr1, tr2
on dbo.Orders;

disable trigger all
on dbo.Orders;

enable trigger all
on database;

disable trigger all
on all server;
```

---

### CREATE / ALTER TRIGGER

`create trigger` and `alter trigger` are batch-isolating (automatically followed by `go`).

The trigger name, `on` clause, timing/events, and body each appear on their own line:

```sql
create trigger BooksAfterInsertTrigger
on Books
after insert
as
begin
    update Books
    set Price = Price * 1.1
    where Id in (
        select Id
        from inserted
    );
end;
go
```

Multiple DML events are comma-separated on the event line:

```sql
create trigger BooksAfterInsertUpdateDeleteTrigger
on Books
after insert, update, delete
as
begin
    print 'modified';
end;
go
```

`instead of` triggers use the same layout:

```sql
create trigger BooksInsteadOfDeleteTrigger
on Books
instead of update, delete
as
begin
    print 'blocked';
end;
go
```

---

### CREATE / ALTER SEQUENCE

The `as` type is placed inline on the header line; remaining options each appear on their own indented line:

```sql
create sequence OrderSeq as bigint
    start with 1
    increment by 1
    minvalue 1
    maxvalue 9999
    cycle
    cache 20;
```

`NO` variants are supported:

```sql
create sequence Seq as int
    start with 1
    no minvalue
    no maxvalue
    no cycle
    no cache;
```

`alter sequence` uses `restart with` (not `start with`):

```sql
alter sequence OrderSeq
    restart with 100
    increment by 5;
```

---

### BULK INSERT

```sql
bulk insert Books
from 'C:\data\books.csv';
```

With a `WITH` options block — each option on its own indented line:

```sql
bulk insert Books
from 'C:\data\books.csv'
with (
    fieldterminator = ',',
    rowterminator = '\n',
    firstrow = 2
);
```

---

### CREATE TYPE

#### Scalar user-defined type (UDDT)

```sql
create type BookTitle from nvarchar(200) not null;

create type OptionalText from nvarchar(500) null;
```

The base data type — including length, precision, and scale — is preserved. Keyword casing applies to the type keyword itself (e.g. `nvarchar`, `int`).

#### Table-valued parameter type (TVP)

The column list follows the same rules as `CREATE TABLE`:

```sql
create type BookList as table (
    BookId int not null,
    Title nvarchar(200) not null,
    Price decimal(10, 2)
);
```

---

### CREATE SYNONYM / DROP SYNONYM

`CREATE SYNONYM` creates an alias for any schema-scoped object (table, view, procedure, function, etc.). The synonym name and its target are both fully schema-qualified when provided:

```sql
create synonym MyAlias for dbo.Books;

create synonym dbo.MyAlias for dbo.Books;
```

`DROP SYNONYM` supports `IF EXISTS`:

```sql
drop synonym MyAlias;

drop synonym if exists dbo.MyAlias;
```

---

### CREATE / ALTER / DROP SCHEMA

`CREATE SCHEMA` with an optional `AUTHORIZATION` clause:

```sql
create schema sales;

create schema sales authorization dbo;
```

`ALTER SCHEMA … TRANSFER` moves an object from one schema to another. A securable-type qualifier is emitted only when explicitly required:

```sql
-- Plain object (table, view, procedure) — no qualifier needed
alter schema sales transfer dbo.Books;

-- User-defined type
alter schema sales transfer type::dbo.BookTitle;

-- XML schema collection
alter schema sales transfer xml schema collection::dbo.BookSchema;
```

`DROP SCHEMA` supports `IF EXISTS`:

```sql
drop schema sales;

drop schema if exists sales;
```

### CREATE / ALTER / DROP PARTITION FUNCTION

`CREATE PARTITION FUNCTION` places `AS RANGE` inline after the parameter type, then indents `FOR VALUES`:

```sql
create partition function pf_date (date) as range right
    for values ('2020-01-01', '2021-01-01', '2022-01-01');

create partition function pf_price (decimal(10, 2)) as range left
    for values (100, 500, 1000);
```

`ALTER PARTITION FUNCTION` indents `split range` or `merge range` under the function name:

```sql
alter partition function pf_date()
    split range ('2023-01-01');

alter partition function pf_date()
    merge range ('2020-01-01');
```

`DROP PARTITION FUNCTION`:

```sql
drop partition function pf_date;
```

### CREATE / ALTER / DROP PARTITION SCHEME

`CREATE PARTITION SCHEME` indents `AS PARTITION` and `TO`/`ALL TO` under the scheme name:

```sql
create partition scheme ps_date
    as partition pf_date
    to ([PRIMARY], fg1, fg2, fg3);
```

When all partitions map to the same filegroup, use `ALL TO`:

```sql
create partition scheme ps_date
    as partition pf_date
    all to ([PRIMARY]);
```

`ALTER PARTITION SCHEME … NEXT USED` indents the clause under the scheme name:

```sql
alter partition scheme ps_date
    next used fg_new;

-- Without a filegroup (resets the designation)
alter partition scheme ps_date
    next used;
```

`DROP PARTITION SCHEME`:

```sql
drop partition scheme ps_date;
```

---

### CREATE / UPDATE / DROP STATISTICS

#### CREATE STATISTICS

The statistics name and `ON table (columns)` clause each appear on their own line. An optional `WHERE` filter and `WITH` options list follow on their own lines. When the `WITH` list is short it stays inline; when it would exceed `printWidth` each option wraps to its own indented line:

```sql
create statistics stat1
on dbo.Orders (OrderDate);

create statistics stat2
on dbo.Orders (CustomerId, OrderDate)
with fullscan;

create statistics stat3
on dbo.Orders (Status)
where Status = 'Active'
with sample 50 percent, norecompute;
```

#### UPDATE STATISTICS

The table name is inline with the verb. An optional parenthesised statistic-name list follows inline on the same line. The `WITH` options list wraps when it exceeds `printWidth`:

```sql
update statistics dbo.Orders;

update statistics dbo.Orders (stat1);

update statistics dbo.Orders
with fullscan;

update statistics dbo.Orders (stat1, stat2)
with norecompute;
```

#### DROP STATISTICS

Multiple `table.statistic` references are comma-separated. When the list would exceed `printWidth` each entry wraps to its own line:

```sql
drop statistics dbo.Orders.stat1;

drop statistics dbo.Orders.stat1,
dbo.Orders.stat2;
```

---

## Procedural / Control Flow

### USE

```sql
use AdventureWorks2019;
```

---

### SET statements

#### SET option ON / OFF

`SET` on/off options are formatted as `set <option> on;` or `set <option> off;`. Keyword casing
applies to both the `SET` keyword and the option name.

```sql
set nocount on;

set ansi_nulls on;

set quoted_identifier on;

set xact_abort off;
```

#### SET STATISTICS

```sql
set statistics io on;

set statistics time off;
```

#### SET IDENTITY_INSERT

```sql
set identity_insert Books on;

set identity_insert Books off;
```

#### SET TRANSACTION ISOLATION LEVEL

```sql
set transaction isolation level read committed;

set transaction isolation level snapshot;

set transaction isolation level serializable;
```

Supported levels: `READ COMMITTED`, `READ UNCOMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`, `SNAPSHOT`.

---

### Transactions

`BEGIN TRANSACTION`, `COMMIT TRANSACTION`, and `ROLLBACK TRANSACTION` stay on one line. An optional savepoint or transaction name follows inline:

```sql
begin transaction;

begin transaction SaveOrder;

commit transaction;

rollback transaction SaveOrder;
```

`SAVE TRANSACTION` creates a savepoint; the name (identifier or variable) stays inline:

```sql
save transaction BeforeSave;

save transaction @sp;
```

---

### WAITFOR

```sql
waitfor delay '00:00:05';

waitfor time '10:00:00';
```

---

### TRUNCATE TABLE

```sql
truncate table Books;
```

---

### EXECUTE

`EXECUTE` (or `EXEC`) calls a stored procedure, runs a string of dynamic SQL, or calls a procedure through a variable name.

Named procedure call — arguments with `@param = value` syntax stay on one line when they fit within `printWidth`; each argument wraps to its own indented line when they don't:

```sql
execute dbo.GetBooks
    @Genre = 3;

execute dbo.UpdateBookPrice
    @BookId = 42,
    @NewPrice = 19.99;
```

Positional arguments follow the same rule:

```sql
execute dbo.GetBooks
    3;

execute @procName
    @param1,
    @param2;
```

Dynamic SQL — the expression inside `(...)` is kept as-is within the parentheses:

```sql
execute (@sql);

execute (@sql1 + @sql2);
```

### Control flow: BREAK / CONTINUE / GOTO / label

```sql
while @i < 10
begin
    if @i = 5
        break;

    set @i = @i + 1;

    continue;
end

goto exit_label;

exit_label:
```

Labels are emitted as-is (ScriptDom preserves the trailing colon in the value).

---

### THROW / RAISERROR

```sql
-- Re-throw inside a CATCH block
throw;

-- New-style throw with arguments
throw 50001, 'Book not found', 1;

-- Legacy RAISERROR
raiserror ('Book not found', 16, 1);
```

---

### TRY / CATCH

```sql
begin try
    insert into Books (Title, Price)
    values
        ('New Book', 29.99);
end try
begin catch
    throw;
end catch
```

---

### DECLARE CURSOR / OPEN / FETCH / CLOSE / DEALLOCATE

`declare … cursor for` puts the cursor name and `cursor` keyword on the first line. The `for` keyword and the query each appear on their own line:

```sql
declare BookCursor cursor
for
select
    Id,
    Title
from Books
where InStock = 1;
```

Cursor options (e.g. `SCROLL`, `READ_ONLY`) appear between the cursor name and the `cursor` keyword:

```sql
declare BookCursor SCROLL cursor
for
select Id
from Books;
```

The remaining cursor operations are single-line statements:

```sql
open BookCursor;

fetch next from BookCursor into @id, @title;

fetch prior from BookCursor;

fetch first from BookCursor into @id, @title;

fetch last from BookCursor into @id;

close BookCursor;

deallocate BookCursor;
```

---

### CHECKPOINT / KILL / RECONFIGURE

Simple operational statements format on one line:

```sql
checkpoint;

checkpoint 5;

kill 52;

kill 52 with statusonly;

reconfigure;

reconfigure with override;
```

---

## Security

### GRANT / DENY / REVOKE

Permissions follow the verb inline and wrap to indented lines only when they exceed `printWidth`. The `ON` clause and the `TO`/`FROM` clause each go on their own line. The principal list after `TO`/`FROM` also wraps when it exceeds `printWidth`. Column lists within a permission (e.g. `SELECT (col1, col2, ...)`) wrap at `printWidth` the same way.

#### GRANT

```sql
grant execute
on GetBooks
to AppUser;

grant select, insert
on object::Books
to AppUser, GuestUser;

grant select (Title, Price)
on Books
to AppUser
with grant option;

grant alter any user
to dbo;

grant connect
to public;

grant control
on schema::dbo
to AppUser;
```

The securable class (`OBJECT`, `SCHEMA`, `DATABASE`, `LOGIN`, `USER`, `ROLE`, `SERVER`, `ASSEMBLY`, etc.) is emitted in the configured keyword case followed by `::`.

When there is no `ON` clause (server-scoped or database-scoped permissions), it is omitted.

#### DENY

```sql
deny delete
on object::Books
to GuestUser;

deny insert, update
on object::Books
to GuestUser
cascade;
```

#### REVOKE

Uses `FROM` to revoke a grant. The optional `GRANT OPTION FOR` prefix and `CASCADE` clause each appear on their own line:

```sql
revoke select
on object::Books
from AppUser;

revoke grant option for select
on object::Books
from AppUser
cascade;
```

---

### ALTER AUTHORIZATION

`ALTER AUTHORIZATION` transfers ownership of a securable to a new principal. The `ON` clause and `TO` clause each appear on their own line. The securable class prefix (`SCHEMA::`, `OBJECT::`, `DATABASE::`, etc.) follows keyword casing:

```sql
alter authorization
on schema::Sales
to Mary;

alter authorization
on object::dbo.Orders
to dbo;

alter authorization
on database::Bookstore
to sa;
```

When no class qualifier is given (e.g. a plain two-part table name), no `::` prefix is emitted:

```sql
alter authorization
on dbo.Orders
to Mary;
```

---

### CREATE / ALTER / DROP USER

#### CREATE USER

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
with default_schema = dbo;
```

#### ALTER USER

```sql
alter user AppUser
with name = NewUser, default_schema = reports;

alter user AppUser
with name = NewUser;
```

#### DROP USER

```sql
drop user AppUser;
```

---

### CREATE / ALTER / DROP LOGIN

#### CREATE LOGIN

The `WITH` or `FROM` clause starts on a new line. A single option stays inline with `WITH`; multiple options are indented one per line:

```sql
create login AppLogin
with password = 'P@ssw0rd';

create login AppLogin
with
  password = 'P@ssw0rd',
  default_database = master,
  check_policy = on,
  check_expiration = on;

create login AppLogin
with password = 'P@ssw0rd' hashed must_change;

create login WindowsUser
from windows;

create login WindowsUser
from windows
with default_domain = CORP;
```

#### ALTER LOGIN

```sql
alter login AppLogin enable;
alter login AppLogin disable;

alter login AppLogin
add credential BackupCred;

alter login AppLogin
drop credential BackupCred;

alter login AppLogin
with password = 'NewP@ss';

alter login AppLogin
with
  password = 'NewP@ss',
  old_password = 'OldP@ss';
```

#### DROP LOGIN

```sql
drop login AppLogin;
```

---

### CREATE / ALTER / DROP ROLE

#### CREATE ROLE

```sql
create role db_reader;

create role db_reader
authorization dbo;
```

#### ALTER ROLE

```sql
alter role db_reader
add member AppUser;

alter role db_reader
drop member AppUser;

alter role db_reader
with name = db_reader_v2;
```

#### DROP ROLE

```sql
drop role db_reader;

drop role if exists db_reader;
```

---

## General

### Comments

#### Trailing line comments

Line comments at the end of a statement or VALUES row are kept on the same line:

```sql
insert into Genres (Id, Name)
values
    (1, 'Fiction'), -- primary genre
    (2, 'Non-Fiction'); -- secondary genre
```

#### Leading comments

Standalone comment lines before a statement are attached to that statement:

```sql
-- Returns all available books
select
    Id,
    Title
from Books
where InStock = 1;
```

#### Block comments

Block comments are preserved in their original relative position. A block comment before a statement appears before it in the output:

```sql
/* legacy view — do not remove */
create or alter view LegacyBooksView
as
select *
from Books;
go
```

#### Commented-out predicates

Line or block comments inside a `where` clause (e.g. a temporarily disabled predicate) are preserved between the surrounding predicates:

```sql
select Id
from Books
where
    InStock = 1
    -- and Price < 20
    and GenreId = 1;
```

#### Comments inside procedure bodies

Comments between statements inside a `begin`/`end` block are preserved in position:

```sql
create procedure ProcessBooks
as
begin
    -- Step 1: mark unavailable books
    update Books
    set InStock = 0
    where PublishedDate < '2000-01-01';

    -- Step 2: return the remaining stock
    select
        Id,
        Title
    from Books
    where InStock = 1;
end;
go
```

---

### GO Batch Separators

The following statement types must be alone in a batch and automatically get a `go` appended:

- `CREATE VIEW` / `ALTER VIEW` / `CREATE OR ALTER VIEW`
- `CREATE PROCEDURE` / `ALTER PROCEDURE` / `CREATE OR ALTER PROCEDURE`
- `CREATE FUNCTION` / `ALTER FUNCTION` / `CREATE OR ALTER FUNCTION`
- `CREATE TRIGGER` / `ALTER TRIGGER`

When multiple such statements appear in a file (separated by `go` in the input), each batch is separated by a blank line in the output:

```sql
create or alter view BooksView
as
select
    Id,
    Title
from Books;
go

create or alter view AuthorsView
as
select
    Id,
    FirstName,
    LastName
from Authors;
go
```

---

## Database administration

### DROP DATABASE

```sql
drop database if exists OldDb;

drop database Db1, Db2;
```

`IF EXISTS` and multiple database names are supported. All keywords respect `sqlKeywordCase`.

### DBCC

```sql
dbcc freeproccache;

dbcc checkdb('AdventureWorks') with no_infomsgs;

dbcc shrinkfile(1, 10);
```

Arguments appear inside parentheses (when present), options after `WITH`. The command name
(e.g. `checkdb`, `shrinkfile`) is treated as a keyword and respects `sqlKeywordCase`.

### BACKUP DATABASE / BACKUP LOG

```sql
backup database Bookstore
    to disk = N'C:\backup\Bookstore.bak'
    with compression, stats = 10;

backup log Bookstore
    to disk = N'C:\backup\Bookstore_log.bak';
```

`BACKUP DATABASE` / `BACKUP LOG` keywords are reformatted. Device type keywords (`DISK`, `TAPE`,
`URL`) and all option names (`COMPRESSION`, `NOFORMAT`, `STATS`, `NAME`, etc.) follow
`sqlKeywordCase`. `TO`, `MIRROR TO`, and `WITH` are indented on new lines; multiple devices each
on their own line.

When the `WITH` option list is short it stays on one line; when it would exceed `printWidth` every
option wraps to its own indented line:

```sql
-- fits on one line
backup database Bookstore
    to disk = N'C:\backup\Bookstore.bak'
    with noformat, noinit, compression;

-- exceeds printWidth → each option on its own line
backup database Bookstore
    to disk = N'C:\backup\Bookstore.bak'
    with copy_only, noformat, noinit, name = N'Bookstore Full Backup', stats = 10;
```

### RESTORE

```sql
restore database Bookstore
    from disk = N'C:\backup\Bookstore.bak'
    with norecovery;

restore database Bookstore
    from disk = N'C:\backup\Bookstore.bak'
    with
        move N'Bookstore_Data' to N'C:\Data\Bookstore.mdf',
        move N'Bookstore_Log' to N'C:\Data\Bookstore.ldf',
        recovery,
        stats = 5;
```

`RESTORE DATABASE` / `RESTORE LOG` / `RESTORE FILELISTONLY` / `RESTORE HEADERONLY` /
`RESTORE VERIFYONLY` are all supported. `FROM` and `WITH` are indented on new lines.
The `WITH` option list follows the same inline/wrap behaviour as `BACKUP`.

### CREATE DATABASE

`COLLATE`, `AS SNAPSHOT OF`, and `AS COPY OF` stay inline on the same line as the database name:

```sql
create database NewDb;

create database NewDb2 collate Latin1_General_CI_AS;

create database SalesSnap as snapshot of SalesDB;
```

For databases with file group or log-on clauses, the file spec raw text is preserved.

### ALTER DATABASE

#### SET options

```sql
alter database AdventureWorks
set recovery full;

alter database current
set auto_close off with no_wait;
```

Option names and values are SQL keywords and respect `sqlKeywordCase`. The option value,
including nested clauses like `QUERY_STORE = ON (...)`, is fully cased. `DATABASE CURRENT`
is used when there is no explicit database name.

SQL Server 2025 options such as `AUTOMATIC_INDEX_COMPACTION` follow the same layout:

```sql
alter database SalesDB
set automatic_index_compaction = on;
```

#### COLLATE / MODIFY NAME

```sql
alter database AdventureWorks collate Latin1_General_CI_AS;

alter database AdventureWorks modify name = AdventureWorks2;
```

#### SCOPED CONFIGURATION

```sql
alter database scoped configuration set maxdop = 4;

alter database scoped configuration clear procedure_cache;

alter database scoped configuration for secondary set maxdop = primary;
```

The full option text including the value is reconstructed even though ScriptDom omits the
value from the fragment span (known ScriptDom quirk, fixed by token-stream scanning).

#### File and filegroup operations

```sql
alter database AdventureWorks add filegroup FG2;
alter database AdventureWorks add filegroup FG2 contains memory_optimized_data;
alter database AdventureWorks remove filegroup FG2;
alter database AdventureWorks remove file AW_Data2;
alter database AdventureWorks modify filegroup FG2 readonly;
alter database AdventureWorks modify filegroup FG2 default;
alter database AdventureWorks modify file (name = AW_Data, size = 100mb);
alter database AdventureWorks add file (...);
alter database AdventureWorks rebuild log on (...);
```

File spec parenthesised content is emitted as raw text.

---

### Semicolons

All statements are terminated with a semicolon. The plugin normalises statements that are missing them.
