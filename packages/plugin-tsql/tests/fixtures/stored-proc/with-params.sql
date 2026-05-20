create procedure GetBookById @BookId int, @IncludeOutOfStock bit = 0 as begin select Id, Title, Price, InStock from Books where Id = @BookId and (InStock = 1 or @IncludeOutOfStock = 1) end
