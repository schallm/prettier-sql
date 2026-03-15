declare @bookId int
declare @title nvarchar(200)
declare @price decimal(10, 2)

declare BookCursor cursor for
    select Id, Title, Price
    from Books
    where InStock = 1
    order by Title asc

open BookCursor

fetch next from BookCursor into @bookId, @title, @price

while @@fetch_status = 0
begin
    print @title

    fetch next from BookCursor into @bookId, @title, @price
end

close BookCursor
deallocate BookCursor

declare ScrollCursor cursor scroll for
    select Id, Title from Books order by Id

open ScrollCursor

fetch first from ScrollCursor into @bookId, @title
fetch last from ScrollCursor into @bookId, @title
fetch absolute 5 from ScrollCursor into @bookId, @title
fetch relative -2 from ScrollCursor into @bookId, @title
fetch prior from ScrollCursor into @bookId, @title

close ScrollCursor
deallocate ScrollCursor
