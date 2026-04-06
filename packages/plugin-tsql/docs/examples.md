# Examples

Before/after transformations showing what the formatter does to real SQL. All examples use
default options (`sqlKeywordCase: lower`, `sqlDensity: standard`, `sqlCommaStyle: trailing`).

In each diff block, `-` lines are the raw input and `+` lines are the formatted output.

---

## DML

### SELECT with JOINs and WHERE

```diff
- SELECT b.Id,b.Title,b.Price,a.FirstName,a.LastName FROM Books b INNER JOIN Authors a ON b.AuthorId=a.Id WHERE b.InStock=1 AND b.Price<50 ORDER BY b.Price DESC
+ select
+   b.Id,
+   b.Title,
+   b.Price,
+   a.FirstName,
+   a.LastName
+ from
+   Books as b
+   inner join Authors as a on b.AuthorId = a.Id
+ where
+   b.InStock = 1
+   and b.Price < 50
+ order by b.Price desc;
```

### JOIN types

**LEFT JOIN** — rows from the left table even when there is no match:

```diff
- SELECT b.Title, a.FirstName, a.LastName FROM Books b LEFT JOIN Authors a ON b.AuthorId = a.Id WHERE a.Id IS NULL
+ select
+   b.Title,
+   a.FirstName,
+   a.LastName
+ from
+   Books as b
+   left join Authors as a on b.AuthorId = a.Id
+ where a.Id is null;
```

**FULL JOIN** — all rows from both sides:

```diff
- SELECT b.Title, a.FirstName FROM Books b FULL OUTER JOIN Authors a ON b.AuthorId = a.Id
+ select
+   b.Title,
+   a.FirstName
+ from
+   Books as b
+   full join Authors as a on b.AuthorId = a.Id;
```

**CROSS JOIN** — Cartesian product:

```diff
- SELECT c.Name AS Category, s.Name AS SubCategory FROM Categories c CROSS JOIN SubCategories s ORDER BY c.Name, s.Name
+ select
+   c.Name as Category,
+   s.Name as SubCategory
+ from
+   Categories as c
+   cross join SubCategories as s
+ order by
+   c.Name asc,
+   s.Name asc;
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
- SELECT Id, Title FROM Books b WHERE AuthorId NOT IN (SELECT AuthorId FROM BannedAuthors)
+ select
+   Id,
+   Title
+ from Books as b
+ where AuthorId not in (
+   select AuthorId
+   from BannedAuthors
+ );
```

### EXISTS

```diff
- SELECT Id, Title FROM Books b WHERE EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.BookId = b.Id)
+ select
+   Id,
+   Title
+ from Books as b
+ where exists (
+   select 1
+   from OrderItems as oi
+   where oi.BookId = b.Id
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
- UPDATE b SET b.Price=b.Price*0.9,b.InStock=1 FROM Books b INNER JOIN Genres g ON b.GenreId=g.Id WHERE g.Name='Fiction' AND b.Price>20
+ update b
+ set
+   b.Price = b.Price * 0.9,
+   b.InStock = 1
+ from
+   Books as b
+   inner join Genres as g on b.GenreId = g.Id
+ where
+   g.Name = 'Fiction'
+   and b.Price > 20;
```

### DELETE with JOIN

```diff
- DELETE oi FROM OrderItems oi INNER JOIN Orders o ON oi.OrderId=o.Id WHERE o.OrderDate<'2020-01-01' AND o.Total<10
+ delete from oi
+ from
+   OrderItems as oi
+   inner join Orders as o on oi.OrderId = o.Id
+ where
+   o.OrderDate < '2020-01-01'
+   and o.Total < 10;
```

### MERGE

```diff
- MERGE INTO Books AS tgt USING BookUpdates AS src ON tgt.Id=src.Id WHEN MATCHED AND tgt.Price<>src.Price THEN UPDATE SET tgt.Price=src.Price,tgt.InStock=src.InStock WHEN NOT MATCHED BY TARGET THEN INSERT(Title,AuthorId,Price,InStock) VALUES(src.Title,src.AuthorId,src.Price,src.InStock) WHEN NOT MATCHED BY SOURCE THEN DELETE;
+ merge into Books as tgt
+ using BookUpdates as src on tgt.Id = src.Id
+ when matched and tgt.Price <> src.Price then
+   update set
+     tgt.Price = src.Price,
+     tgt.InStock = src.InStock
+ when not matched by target then
+   insert (Title, AuthorId, Price, InStock)
+   values (src.Title, src.AuthorId, src.Price, src.InStock)
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
- CREATE VIEW dbo.BookSummary AS SELECT b.Id, b.Title, b.Price, g.Name AS Genre FROM Books b INNER JOIN Genres g ON b.GenreId = g.Id WHERE b.InStock = 1
+ create view dbo.BookSummary
+ as
+ select
+   b.Id,
+   b.Title,
+   b.Price,
+   g.Name as Genre
+ from
+   Books as b
+   inner join Genres as g on b.GenreId = g.Id
+ where b.InStock = 1;
+ go
```

### CREATE PROCEDURE

```diff
- CREATE PROCEDURE dbo.GetBooksByAuthor @AuthorId INT, @MinPrice DECIMAL(10,2)=0 AS BEGIN SET NOCOUNT ON; SELECT b.Id,b.Title,b.Price FROM Books b WHERE b.AuthorId=@AuthorId AND b.Price>=@MinPrice ORDER BY b.Price END
+ create procedure dbo.GetBooksByAuthor
+   @AuthorId int,
+   @MinPrice decimal(10,2) = 0
+ as
+ begin
+   set nocount on;
+
+   select
+     b.Id,
+     b.Title,
+     b.Price
+   from Books as b
+   where
+     b.AuthorId = @AuthorId
+     and b.Price >= @MinPrice
+   order by b.Price asc;
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
