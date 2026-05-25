-- OFFSET/FETCH NEXT (keyset pagination)
select Id, Title from Books order by Title offset 10 rows fetch next 20 rows only

-- OFFSET only (no FETCH)
select Id, Title from Books order by Title offset 0 rows

-- parametric pagination
select Id, Title, Price, AuthorId from Books where InStock = 1 order by Title asc, Price desc offset @skip rows fetch next @take rows only

-- ORDER BY + OFFSET on UNION ALL result
select Id, Title from Books
union all
select Id, Title from ArchivedBooks
order by Title offset 0 rows fetch next 10 rows only
