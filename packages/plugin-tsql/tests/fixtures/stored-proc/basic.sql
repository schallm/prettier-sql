create procedure GetAvailableBooks as begin select Id, Title, Price from Books where InStock = 1 order by Title asc end
