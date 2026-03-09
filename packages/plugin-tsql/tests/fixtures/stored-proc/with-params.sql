create procedure GetBookById @bookId int, @includeOutOfStock bit = 0 as begin select Id, Title, Price, InStock from Books where Id = @bookId and (InStock = 1 or @includeOutOfStock = 1) end
