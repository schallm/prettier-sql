select GenreId, sum(Price) as Total from Books group by rollup(GenreId)

select GenreId, AuthorId, sum(Price) as Total from Books group by cube(GenreId, AuthorId)

select GenreId, AuthorId, sum(Price) as Total from Books group by grouping sets ((GenreId, AuthorId), (GenreId), ())

select GenreId, AuthorId, count(*) as BookCount from Books group by rollup(GenreId, AuthorId)
