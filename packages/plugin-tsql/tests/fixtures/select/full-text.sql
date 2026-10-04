select BookId, Title from Books where contains(Title, '"SQL Server"')

select BookId, Title from Books where freetext(Title, 'database programming')

select BookId from Books where contains(*, 'programming')

select BookId from Books where contains((Title, AuthorId), 'design')

select BookId from Books where contains(Title, 'query', language 1033)

select b.BookId, b.Title, ft.[rank] from Books as b inner join containstable(Books, Title, '"SQL"') as ft on b.BookId = ft.[key]

select b.BookId, ft.[rank] from Books as b inner join freetexttable(Books, *, 'programming', 10) as ft on b.BookId = ft.[key]


-- PROPERTY(column, 'name'): search one document property
select DocumentId from Documents where contains(property(Document, 'Title'), 'budget')

select d.DocumentId, ft.[rank] from Documents as d inner join containstable(Documents, property(Document, 'Author'), 'Smith') as ft on d.DocumentId = ft.[key]
