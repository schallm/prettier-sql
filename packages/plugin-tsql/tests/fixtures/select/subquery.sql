select Id, Title from Books where Id in (select BookId from OrderItems where UnitPrice > 50) and GenreId = (select Id from Genres where Name = 'Fiction')
