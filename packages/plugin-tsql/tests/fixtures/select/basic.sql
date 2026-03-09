select Books.Id,Books.Title,Authors.FirstName from Books inner join Authors on Books.AuthorId=Authors.Id where Books.InStock=1 order by Books.Title asc
