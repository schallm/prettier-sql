select Id from Books
where InStock = 1
-- and Price < 20
and GenreId = 1

select BookId from Books
where 1 = 1
    and Books.GenreId in (1)
    --and Books.GenreId in (select GenreId from Genres where Name = 'Fiction')
    and Books.PublisherId in (4)
    --and Books.PublisherId in (select PublisherId from Publishers where Country = 'UK')
    and Books.AuthorId in (101, 102)

select b.BookId, b.Title
from Books as b
inner join Authors as a on b.AuthorId = a.Id
-- left join: publishers may not exist for all books
left join Publishers as p on b.PublisherId = p.Id

select b.BookId from Books as b
inner join Authors as a on b.AuthorId = a.Id
-- optional: genre
left join Genres as g on b.GenreId = g.Id
-- optional: publisher
left join Publishers as p on b.PublisherId = p.Id

select BookId from Books;
/* end of queries */
