with cte as (select Id from Books where InStock = 0) delete from Books from Books inner join cte on Books.Id = cte.Id

with old as (select Id from OrderItems where OrderId = 99) delete from old
