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
