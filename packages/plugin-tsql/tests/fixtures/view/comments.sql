create or alter view [dbo].[ExampleView]
/* with encryption */
as
select BookId from Books;
go
-- view description
create or alter view TestBooksView as select 1 as x;
go
create or alter view BooksView
/* with encryption */
as
select 1 as x;
go
create or alter view AuthorsView
as
select 2 as y;
go
create view dbo.ActiveOrders -- open orders only
as select OrderId from dbo.Orders where Status = 'open';
go
create view dbo.ClosedOrders with schemabinding -- closed orders
/* archived nightly */
as select OrderId from dbo.Orders where Status = 'closed';
