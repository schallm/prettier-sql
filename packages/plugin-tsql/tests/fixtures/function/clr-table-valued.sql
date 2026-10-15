-- A CLR table-valued function lists its result columns
create function dbo.clr_tvf (@a int)
returns table (a int, b nvarchar(10))
as external name asm.cls.mth
go

-- ORDER: the order the function returns its rows in
create function dbo.SortedBooks(@Shelf int) returns table (BookId int, Title nvarchar(100), Added datetime) with execute as 'Librarian' order (Added desc, BookId asc) as external name Library.[Library.Functions].SortedBooks
go
create function dbo.Ids() returns table (Id int) order (Id) as external name Library.Functions.Ids
go
