select BookId, Title from Books where InStock = 1 option (recompile)

select BookId from Books option (recompile)

select BookId, Title from Books where InStock = 1 order by Title asc option (recompile)

select BookId from Books option (maxdop 4)

select BookId from Books option (recompile, maxdop 4)
