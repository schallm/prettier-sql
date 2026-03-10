create function GetBooksByGenre (@GenreId int) returns table as return select Id, Title, Price from Books where GenreId = @GenreId and InStock = 1
