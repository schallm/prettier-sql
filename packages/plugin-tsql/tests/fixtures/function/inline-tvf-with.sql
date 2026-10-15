-- An inline table-valued function's query keeps its WITH
create function dbo.RecentBooks() returns table as return (with New as (select BookId, Year from dbo.Books where Year > 2000) select BookId from New)
go
create function dbo.BookTitles() returns table return (with xmlnamespaces (default 'urn:books') select Doc.value('(/book/title)[1]', 'nvarchar(100)') as Title from dbo.Books)
go
