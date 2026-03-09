create function GetBooksByGenre (@genreId int) returns table as return select Id, Title, Price from Books where GenreId = @genreId and InStock = 1
