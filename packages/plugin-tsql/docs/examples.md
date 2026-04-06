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

```diff
- INSERT INTO Books(Title,AuthorId,GenreId,Price,InStock,PublishedDate) VALUES('The Pragmatic Programmer',1,2,39.99,1,'2019-09-23')
+ insert into Books (Title, AuthorId, GenreId, Price, InStock, PublishedDate)
+ values
+   ('The Pragmatic Programmer', 1, 2, 39.99, 1, '2019-09-23');
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
