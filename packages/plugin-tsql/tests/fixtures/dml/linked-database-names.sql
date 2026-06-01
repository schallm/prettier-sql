select
  mc.BookId,
  mc.Title
from ArchiveDb..Books as mc
inner join SharedDb..Authors as a on a.AuthorId = mc.AuthorId
where mc.InStock = 1;

select
  b.Title,
  g.Name as Genre
from LibraryServer.BooksDb.dbo.Books as b
inner join LibraryServer.BooksDb..Genres as g on g.GenreId = b.GenreId;
