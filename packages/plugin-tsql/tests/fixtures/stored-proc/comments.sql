create procedure GetBookById
/**********************
** Author: Jon
** Date:   2012-01-10
**********************/
@Id int, @IncludeOutOfStock bit = 0
as begin select BookId from Books where BookId = @Id end
go
create procedure GetAvailableBooks as begin
-- fetch available books only
select BookId, Title from Books where InStock = 1 end
go
create procedure GetBookByIdV2
@Id int,
@Active bit
/*WITH ENCRYPTION*/
as begin select BookId from Books where BookId = @Id end
