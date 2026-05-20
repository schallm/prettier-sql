create trigger BooksInsteadOfDelete on Books instead of delete as
begin
    update Books set IsDeleted = 1, DeletedAt = getdate() where Id in (select Id from deleted)
end
