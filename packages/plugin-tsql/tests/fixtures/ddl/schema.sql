create schema sales;
go
create schema sales authorization dbo;
go
alter schema sales transfer dbo.Books;
go
alter schema sales transfer type::dbo.BookTitle;
go
drop schema sales;
go
drop schema if exists sales;
go
create synonym MyAlias for dbo.Books;
go
create synonym dbo.MyAlias for dbo.Books;
go
drop synonym MyAlias;
go
drop synonym if exists dbo.MyAlias;
