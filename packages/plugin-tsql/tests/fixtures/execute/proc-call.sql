execute dbo.GetAvailableBooks

execute dbo.GetBooksByGenre @GenreId = 3

execute dbo.UpdateBookPrice @BookId = 42, @NewPrice = 19.99

execute dbo.GetCount @Result = @count output
