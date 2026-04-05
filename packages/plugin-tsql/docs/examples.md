# Examples

Before/after transformations showing what the formatter does to real SQL. All examples use
default options (`sqlKeywordCase: lower`, `sqlDensity: standard`, `sqlCommaStyle: trailing`).

In each diff block, `-` lines are the raw input and `+` lines are the formatted output.

---

## SELECT with JOINs and WHERE

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

---

## CTE with window function

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

---

## Running totals with OVER

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

---

## INSERT

```diff
- INSERT INTO Books(Title,AuthorId,GenreId,Price,InStock,PublishedDate) VALUES('The Pragmatic Programmer',1,2,39.99,1,'2019-09-23')
+ insert into Books (Title, AuthorId, GenreId, Price, InStock, PublishedDate)
+ values
+   ('The Pragmatic Programmer', 1, 2, 39.99, 1, '2019-09-23');
```

---

## UPDATE with JOIN

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

---

## DELETE with JOIN

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

---

## MERGE

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

## CREATE PROCEDURE

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

## ALTER TABLE

```diff
- ALTER TABLE Books ALTER COLUMN Price DECIMAL(12,2) NOT NULL
+ alter table Books
+ alter column Price decimal(12,2) not null;
```

```diff
- ALTER TABLE Orders ADD CONSTRAINT FK_Orders_Customers FOREIGN KEY(CustomerId) REFERENCES Customers(Id) ON DELETE CASCADE ON UPDATE NO ACTION
+ alter table Orders
+ add constraint FK_Orders_Customers
+   foreign key (CustomerId) references Customers (Id)
+   on delete cascade
+   on update no action;
```
