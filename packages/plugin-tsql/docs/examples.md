# Examples

Before/after transformations showing what the formatter does to real SQL. All examples use
default options (`sqlKeywordCase: lower`, `sqlDensity: standard`, `sqlCommaStyle: trailing`).

In each diff block, `-` lines are the raw input and `+` lines are the formatted output.

---

## DML

### SELECT with JOINs and WHERE

```diff
- SELECT Books.Id,Books.Title,Books.Price,Authors.FirstName,Authors.LastName FROM Books INNER JOIN Authors ON Books.AuthorId=Authors.Id WHERE Books.InStock=1 AND Books.Price<50 ORDER BY Books.Price DESC
+ select
+   Books.Id,
+   Books.Title,
+   Books.Price,
+   Authors.FirstName,
+   Authors.LastName
+ from
+   Books
+   inner join Authors on Books.AuthorId = Authors.Id
+ where
+   Books.InStock = 1
+   and Books.Price < 50
+ order by Books.Price desc;
```

### JOIN types

**LEFT JOIN** — rows from the left table even when there is no match:

```diff
- SELECT Books.Title, Authors.FirstName, Authors.LastName FROM Books LEFT JOIN Authors ON Books.AuthorId = Authors.Id WHERE Authors.Id IS NULL
+ select
+   Books.Title,
+   Authors.FirstName,
+   Authors.LastName
+ from
+   Books
+   left join Authors on Books.AuthorId = Authors.Id
+ where Authors.Id is null;
```

**FULL JOIN** — all rows from both sides:

```diff
- SELECT Books.Title, Authors.FirstName FROM Books FULL OUTER JOIN Authors ON Books.AuthorId = Authors.Id
+ select
+   Books.Title,
+   Authors.FirstName
+ from
+   Books
+   full join Authors on Books.AuthorId = Authors.Id;
```

**CROSS JOIN** — Cartesian product:

```diff
- SELECT Categories.Name AS Category, SubCategories.Name AS SubCategory FROM Categories CROSS JOIN SubCategories ORDER BY Categories.Name, SubCategories.Name
+ select
+   Categories.Name as Category,
+   SubCategories.Name as SubCategory
+ from
+   Categories
+   cross join SubCategories
+ order by
+   Categories.Name asc,
+   SubCategories.Name asc;
```

### CASE expression

**Searched CASE** — each `WHEN` tests a condition:

```diff
- SELECT Id, CASE WHEN Price < 10 THEN 'Budget' WHEN Price < 30 THEN 'Mid' ELSE 'Premium' END AS Cat FROM Books
+ select
+   Id,
+   case
+     when Price < 10 then 'Budget'
+     when Price < 30 then 'Mid'
+     else 'Premium'
+   end as Cat
+ from Books;
```

**Simple CASE** — matches a single expression:

```diff
- SELECT Id, CASE GenreId WHEN 1 THEN 'Fiction' WHEN 2 THEN 'Non-Fiction' ELSE 'Other' END AS Genre FROM Books
+ select
+   Id,
+   case GenreId
+     when 1 then 'Fiction'
+     when 2 then 'Non-Fiction'
+     else 'Other'
+   end as Genre
+ from Books;
```

### IN / NOT IN

**Value list:**

```diff
- SELECT Id, Title FROM Books WHERE GenreId IN (1, 2, 3) AND Status NOT IN ('Draft', 'Archived')
+ select
+   Id,
+   Title
+ from Books
+ where
+   GenreId in (1, 2, 3)
+   and Status not in ('Draft', 'Archived');
```

**Subquery:**

```diff
- SELECT Id, Title FROM Books WHERE AuthorId NOT IN (SELECT AuthorId FROM BannedAuthors)
+ select
+   Id,
+   Title
+ from Books
+ where AuthorId not in (
+   select AuthorId
+   from BannedAuthors
+ );
```

### ANY / ALL

```diff
- SELECT Id FROM Books WHERE Price > ALL(SELECT Price FROM ArchivedBooks WHERE InStock=0)
+ select Id
+ from Books
+ where Price > all (
+   select Price
+   from ArchivedBooks
+   where InStock = 0
+ );
```

### Inline VALUES derived table

```diff
- SELECT v.Id, v.Name FROM (VALUES (1,'Alice'),(2,'Bob')) AS v(Id,Name)
+ select
+   v.Id,
+   v.Name
+ from (values (1, 'Alice'), (2, 'Bob')) as v(Id, Name);
```

### EXISTS

```diff
- SELECT Id, Title FROM Books WHERE EXISTS (SELECT 1 FROM OrderItems WHERE OrderItems.BookId = Books.Id)
+ select
+   Id,
+   Title
+ from Books
+ where exists (
+   select 1
+   from OrderItems
+   where OrderItems.BookId = Books.Id
+ );
```

### CTE with window function

```diff
- with ranked as (select Id,Title,Price,RANK() over(partition by GenreId order by Price desc) as PriceRank from Books where InStock=1) select * from ranked where PriceRank<=3
+ with ranked as (
+   select
+     Id,
+     Title,
+     Price,
+     rank() over (
+       partition by GenreId
+       order by Price desc
+     ) as PriceRank
+   from Books
+   where InStock = 1
+ )
+ select *
+ from ranked
+ where PriceRank <= 3;
```

### Window functions with OVER

```diff
- SELECT Id,CustomerId,Total,SUM(Total) OVER(PARTITION BY CustomerId ORDER BY OrderDate ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) RunningTotal,AVG(Total) OVER(PARTITION BY CustomerId) AvgTotal FROM Orders
+ select
+   Id,
+   CustomerId,
+   Total,
+   sum(Total) over (
+     partition by CustomerId
+     order by OrderDate asc
+     rows between unbounded preceding and current row
+   ) as RunningTotal,
+   avg(Total) over (partition by CustomerId) as AvgTotal
+ from Orders;
```

### GROUP BY and HAVING

```diff
- SELECT AuthorId, COUNT(*) AS BookCount, AVG(Price) AS AvgPrice FROM Books WHERE InStock=1 GROUP BY AuthorId HAVING COUNT(*)>5 ORDER BY BookCount DESC
+ select
+   AuthorId,
+   count(*) as BookCount,
+   avg(Price) as AvgPrice
+ from Books
+ where InStock = 1
+ group by AuthorId
+ having count(*) > 5
+ order by BookCount desc;
```

### INSERT

Single-values rows sit inline with `values` when they fit within `printWidth`:

```diff
- INSERT INTO Books(Title,Price,InStock) VALUES('The Pragmatic Programmer',39.99,1)
+ insert into Books (Title, Price, InStock)
+ values ('The Pragmatic Programmer', 39.99, 1);
```

When the values are too long to fit inline, the opening `(` stays with `values` and each value gets its own line:

```diff
- INSERT INTO Books(Title,AuthorId,GenreId,Price,InStock,PublishedDate) VALUES('The Pragmatic Programmer: From Journeyman to Master',1,2,39.99,1,'2019-09-23')
+ insert into Books (Title, AuthorId, GenreId, Price, InStock, PublishedDate)
+ values (
+   'The Pragmatic Programmer: From Journeyman to Master',
+   1,
+   2,
+   39.99,
+   1,
+   '2019-09-23'
+ );
```

Multiple rows always break with one row per line:

```diff
- INSERT INTO Genres(Id,Name) VALUES(1,'Fiction'),(2,'Non-Fiction')
+ insert into Genres (Id, Name)
+ values
+   (1, 'Fiction'),
+   (2, 'Non-Fiction');
```

### UPDATE with JOIN

```diff
- UPDATE Books SET Books.Price=Books.Price*0.9,Books.InStock=1 FROM Books INNER JOIN Genres ON Books.GenreId=Genres.Id WHERE Genres.Name='Fiction' AND Books.Price>20
+ update Books
+ set
+   Books.Price = Books.Price * 0.9,
+   Books.InStock = 1
+ from
+   Books
+   inner join Genres on Books.GenreId = Genres.Id
+ where
+   Genres.Name = 'Fiction'
+   and Books.Price > 20;
```

### DELETE with JOIN

```diff
- DELETE OrderItems FROM OrderItems INNER JOIN Orders ON OrderItems.OrderId=Orders.Id WHERE Orders.OrderDate<'2020-01-01' AND Orders.Total<10
+ delete from OrderItems
+ from
+   OrderItems
+   inner join Orders on OrderItems.OrderId = Orders.Id
+ where
+   Orders.OrderDate < '2020-01-01'
+   and Orders.Total < 10;
```

### MERGE

```diff
- MERGE INTO Books USING BookUpdates ON Books.Id=BookUpdates.Id WHEN MATCHED AND Books.Price<>BookUpdates.Price THEN UPDATE SET Books.Price=BookUpdates.Price,Books.InStock=BookUpdates.InStock WHEN NOT MATCHED BY TARGET THEN INSERT(Title,AuthorId,Price,InStock) VALUES(BookUpdates.Title,BookUpdates.AuthorId,BookUpdates.Price,BookUpdates.InStock) WHEN NOT MATCHED BY SOURCE THEN DELETE;
+ merge into Books
+ using BookUpdates on Books.Id = BookUpdates.Id
+ when matched and Books.Price <> BookUpdates.Price then
+   update set
+     Books.Price = BookUpdates.Price,
+     Books.InStock = BookUpdates.InStock
+ when not matched by target then
+   insert (Title, AuthorId, Price, InStock)
+   values (BookUpdates.Title, BookUpdates.AuthorId, BookUpdates.Price, BookUpdates.InStock)
+ when not matched by source then
+   delete;
```

`TOP (N)` limits how many target rows are considered — placed between `MERGE` and `INTO`:

```diff
- MERGE TOP(500) INTO Books USING BookUpdates ON Books.Id=BookUpdates.Id WHEN MATCHED THEN UPDATE SET Books.Price=BookUpdates.Price WHEN NOT MATCHED THEN INSERT(Id,Title,Price) VALUES(BookUpdates.Id,BookUpdates.Title,BookUpdates.Price);
+ merge top (500) into Books
+ using BookUpdates on Books.Id = BookUpdates.Id
+ when matched then
+   update set Books.Price = BookUpdates.Price
+ when not matched then
+   insert (Id, Title, Price)
+   values (BookUpdates.Id, BookUpdates.Title, BookUpdates.Price);
```

---

## DDL

### CREATE TABLE

Full table definition with identity column, nullable column, primary key, foreign key with
referential action, and check constraint:

```diff
- CREATE TABLE Orders(Id INT IDENTITY(1,1) NOT NULL, CustomerId INT NOT NULL, Total DECIMAL(18,2) NOT NULL, OrderDate DATE NOT NULL, CONSTRAINT PK_Orders PRIMARY KEY(Id), CONSTRAINT FK_Orders_Customers FOREIGN KEY(CustomerId) REFERENCES Customers(Id) ON DELETE CASCADE, CONSTRAINT CK_Orders_Total CHECK(Total >= 0))
+ create table Orders (
+   Id int identity(1, 1) not null,
+   CustomerId int not null,
+   Total decimal(18, 2) not null,
+   OrderDate date not null,
+   constraint PK_Orders primary key (Id),
+   constraint FK_Orders_Customers
+     foreign key (CustomerId) references Customers (Id)
+     on delete cascade,
+   constraint CK_Orders_Total check (Total >= 0)
+ );
```

### ALTER TABLE

```diff
- ALTER TABLE Books ALTER COLUMN Price DECIMAL(12,2) NOT NULL
+ alter table Books
+ alter column Price decimal(12, 2) not null;
```

```diff
- ALTER TABLE Orders ADD CONSTRAINT FK_Orders_Customers FOREIGN KEY(CustomerId) REFERENCES Customers(Id) ON DELETE CASCADE ON UPDATE NO ACTION
+ alter table Orders
+ add constraint FK_Orders_Customers
+   foreign key (CustomerId) references Customers (Id)
+   on delete cascade
+   on update no action;
```

### CREATE VIEW

```diff
- CREATE VIEW dbo.BookSummary AS SELECT Books.Id, Books.Title, Books.Price, Genres.Name AS Genre FROM Books INNER JOIN Genres ON Books.GenreId = Genres.Id WHERE Books.InStock = 1
+ create view dbo.BookSummary
+ as
+ select
+   Books.Id,
+   Books.Title,
+   Books.Price,
+   Genres.Name as Genre
+ from
+   Books
+   inner join Genres on Books.GenreId = Genres.Id
+ where Books.InStock = 1;
+ go
```

### CREATE PROCEDURE

```diff
- CREATE PROCEDURE dbo.GetBooksByAuthor @AuthorId INT, @MinPrice DECIMAL(10,2)=0 AS BEGIN SET NOCOUNT ON; SELECT Books.Id,Books.Title,Books.Price FROM Books WHERE Books.AuthorId=@AuthorId AND Books.Price>=@MinPrice ORDER BY Books.Price END
+ create procedure dbo.GetBooksByAuthor
+   @AuthorId int,
+   @MinPrice decimal(10,2) = 0
+ as
+ begin
+   set nocount on;
+
+   select
+     Books.Id,
+     Books.Title,
+     Books.Price
+   from Books
+   where
+     Books.AuthorId = @AuthorId
+     and Books.Price >= @MinPrice
+   order by Books.Price asc;
+ end;
+ go
```

---

## Procedural / Control Flow

### DECLARE and variables

Multiple variables in a single `DECLARE` are split to one per statement. Blank lines separate
the declaration block from the statements that follow:

```diff
- DECLARE @MinPrice DECIMAL(10,2), @MaxPrice DECIMAL(10,2); SET @MinPrice = 10.00; SET @MaxPrice = 50.00; SELECT Id, Title, Price FROM Books WHERE Price BETWEEN @MinPrice AND @MaxPrice
+ declare @MinPrice decimal(10, 2);
+ declare @MaxPrice decimal(10, 2);
+
+ set @MinPrice = 10.00;
+
+ set @MaxPrice = 50.00;
+
+ select
+   Id,
+   Title,
+   Price
+ from Books
+ where Price between @MinPrice and @MaxPrice;
```

### EXECUTE

Named proc call with `@param = value` arguments:

```diff
- EXECUTE dbo.GetBooks @Genre=3
+ execute dbo.GetBooks
+   @Genre = 3;
```

Dynamic SQL — concatenation expression is preserved inside the parentheses:

```diff
- EXECUTE(@sql1+@sql2)
+ execute (@sql1 + @sql2);
```

### IF / ELSE

```diff
- IF EXISTS (SELECT 1 FROM Books WHERE Price < 0) BEGIN RAISERROR('Invalid price', 16, 1); END ELSE BEGIN PRINT 'Prices OK'; END
+ if exists (
+   select 1
+   from Books
+   where Price < 0
+ )
+ begin
+   raiserror ('Invalid price', 16, 1);
+ end
+ else
+ begin
+   print 'Prices OK';
+ end
```

### Compound assignment operators

`+=`, `-=`, `*=`, `/=`, and `%=` are preserved as-is:

```diff
- DECLARE @n INT=10; SET @n+=5; SET @n-=2; SET @n*=3; SET @n/=4; SET @n%=7
+ declare @n int = 10;
+
+ set @n += 5;
+
+ set @n -= 2;
+
+ set @n *= 3;
+
+ set @n /= 4;
+
+ set @n %= 7;
```

### Standalone BEGIN / END

`BEGIN...END` used as a grouping block (without `IF`, `WHILE`, etc.) is preserved as a
top-level statement:

```diff
- BEGIN SET NOCOUNT ON; SELECT Id, Title FROM Books WHERE InStock=1 END
+ begin
+   set nocount on;
+
+   select
+     Id,
+     Title
+   from Books
+   where InStock = 1;
+ end
```

---

## Identifiers

### Bracket quoting

Redundant brackets are stripped from identifiers that don't need them. Brackets are preserved when a name contains spaces, special characters, or starts with a digit.

```diff
- SELECT [Books].[Id], [Books].[Title] FROM [Books] WHERE [Books].[InStock] = 1
+ select
+   Books.Id,
+   Books.Title
+ from Books
+ where Books.InStock = 1;
```

Names that require brackets are left bracketed:

```diff
- SELECT [My Table].[Book Id] FROM [My Table]
+ select [My Table].[Book Id]
+ from [My Table];
```

---

## Security

### GRANT / DENY / REVOKE

```diff
- GRANT SELECT, INSERT, UPDATE ON OBJECT::dbo.Books TO AppUser WITH GRANT OPTION
+ grant select, insert, update
+ on object::dbo.Books
+ to AppUser
+ with grant option;
```

```diff
- DENY DELETE ON OBJECT::dbo.Books TO GuestUser CASCADE
+ deny delete
+ on object::dbo.Books
+ to GuestUser
+ cascade;
```

---

## SQL Server 2025

These examples require ScriptDom 180.37+ (`Microsoft.SqlServer.TransactSql.ScriptDom` ≥ 180.37.3).

### `||` pipe concatenation

Simple chain stays inline:

```diff
- SELECT FirstName || ' ' || LastName AS FullName FROM Authors
+ select FirstName || ' ' || LastName as FullName
+ from Authors;
```

Long chain wraps with `||` at the continuation-line indent:

```diff
- SELECT AuthorId, FirstName || ' ' || LastName || ' <' || Email || '>' AS Contact FROM Authors WHERE IsActive = 1
+ select
+   AuthorId,
+   FirstName || ' ' || LastName || ' <' || Email || '>' as Contact
+ from Authors
+ where IsActive = 1;
```

### `CURRENT_DATE`

```diff
- SELECT Id, Title FROM Books WHERE PublishedDate <= CURRENT_DATE
+ select
+   Id,
+   Title
+ from Books
+ where PublishedDate <= current_date;
```

### REGEXP_LIKE (scalar — in SELECT)

Short pattern stays inline:

```diff
- SELECT Id, Title, REGEXP_COUNT(Title, '[aeiouAEIOU]') AS VowelCount FROM Books
+ select
+   Id,
+   Title,
+   regexp_count(Title, '[aeiouAEIOU]') as VowelCount
+ from Books;
```

Long pattern breaks to the next line:

```diff
- SELECT Id, Title, Email FROM Authors WHERE REGEXP_LIKE(Email, '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
+ select
+   Id,
+   Title,
+   Email
+ from Authors
+ where regexp_like(Email, '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');
```

### REGEXP_LIKE (predicate — in WHERE)

`REGEXP_LIKE` in `WHERE` is a boolean predicate — keyword case and arg wrapping apply the same way:

```diff
- SELECT Id, Title FROM Books WHERE REGEXP_LIKE(Title, '^The') AND Price < 30
+ select
+   Id,
+   Title
+ from Books
+ where
+   regexp_like(Title, '^The')
+   and Price < 30;
```

### REGEXP_REPLACE / REGEXP_SUBSTR

```diff
- SELECT Id, REGEXP_REPLACE(Title, '\s+', ' ') AS CleanTitle, REGEXP_REPLACE(Notes, '[<>]', '') AS SafeNotes FROM Books
+ select
+   Id,
+   regexp_replace(Title, '\s+', ' ') as CleanTitle,
+   regexp_replace(Notes, '[<>]', '') as SafeNotes
+ from Books;
```

### REGEXP_MATCHES with CROSS APPLY

The function name and alias stay on the same line as `cross apply`:

```diff
- SELECT B.Title, M.[value] AS Keyword FROM Books AS B CROSS APPLY REGEXP_MATCHES(B.Description, '\b[A-Z][a-z]{4,}\b') AS M
+ select
+   B.Title,
+   M.[value] as Keyword
+ from
+   Books as B
+   cross apply regexp_matches(B.Description, '\b[A-Z][a-z]{4,}\b') as M;
```

### `VECTOR(n)` data type

The dimension is preserved in `CREATE TABLE` and `DECLARE`:

```diff
- CREATE TABLE BookEmbeddings (Id INT NOT NULL, BookId INT NOT NULL, Embedding vector(1536) NOT NULL, CONSTRAINT PK_BookEmbeddings PRIMARY KEY (Id), CONSTRAINT FK_BookEmbeddings_Books FOREIGN KEY (BookId) REFERENCES Books(Id))
+ create table BookEmbeddings (
+   Id int not null,
+   BookId int not null,
+   Embedding vector(1536) not null,
+   constraint PK_BookEmbeddings primary key (Id),
+   constraint FK_BookEmbeddings_Books foreign key (BookId) references Books (Id)
+ );
```

```diff
- DECLARE @QueryEmbedding vector(1536); SET @QueryEmbedding = '[0.1, 0.2, 0.3]'
+ declare @QueryEmbedding vector(1536);
+ set @QueryEmbedding = '[0.1, 0.2, 0.3]';
```

### VECTOR_DISTANCE — semantic book search

```diff
- SELECT TOP(10) B.Id, B.Title, VECTOR_DISTANCE('cosine', E.Embedding, @QueryEmbedding) AS Distance FROM Books AS B INNER JOIN BookEmbeddings AS E ON B.Id = E.BookId ORDER BY Distance ASC
+ select top (10)
+   B.Id,
+   B.Title,
+   vector_distance('cosine', E.Embedding, @QueryEmbedding) as Distance
+ from
+   Books as B
+   inner join BookEmbeddings as E on B.Id = E.BookId
+ order by Distance asc;
```

### CREATE VECTOR INDEX

Index name on the first line; `ON table(column)` indented one level; `WITH` options at the outer level:

```diff
- CREATE VECTOR INDEX IX_BookEmbeddings_Vec ON BookEmbeddings(Embedding) WITH (METRIC = 'cosine', TYPE = 'DiskANN')
+ create vector index IX_BookEmbeddings_Vec
+   on BookEmbeddings(Embedding)
+ with (metric = 'cosine', type = 'DiskANN');
```

### JSON_OBJECTAGG

```diff
- SELECT GenreId, json_objectagg(Title: Price null on null) AS PriceMap FROM Books GROUP BY GenreId
+ select
+   GenreId,
+   json_objectagg(Title: Price null on null) as PriceMap
+ from Books
+ group by GenreId;
```

### EDIT_DISTANCE — fuzzy title search

```diff
- SELECT Id, Title, EDIT_DISTANCE(Title, @SearchTerm) AS Distance FROM Books WHERE EDIT_DISTANCE(Title, @SearchTerm) <= 3 ORDER BY Distance ASC
+ select
+   Id,
+   Title,
+   edit_distance(Title, @SearchTerm) as Distance
+ from Books
+ where edit_distance(Title, @SearchTerm) <= 3
+ order by Distance asc;
```
