declare @price decimal(10, 2) = 29.99
declare @title nvarchar(200)
declare @count int

set @count = (select count(*) from Books where InStock = 1)

if @count > 0
begin
    set @title = 'Books available'
end
else
begin
    set @title = 'No books available'
end

if @price < 10
    set @title = 'cheap'
else if @price < 50
    set @title = 'mid-range'
else
    set @title = 'expensive'

while @count > 0
begin
    set @count = @count - 1

    if @count = 5
        continue

    if @count = 0
        break
end

begin try
    insert into Books (Title, Price, InStock) values ('New Book', 19.99, 1)
end try
begin catch
    declare @msg nvarchar(4000) = error_message()
    declare @sev int = error_severity()
    declare @state int = error_state()
    raiserror (@msg, @sev, @state)
end catch

goto Cleanup

Cleanup:
    print 'done'

return
