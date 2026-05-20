with cte as (select Id, Price from Books where InStock = 1) update Books set Price = Price * 0.9 from Books inner join cte on Books.Id = cte.Id

with cte as (select Id, Price, row_number() over (partition by AuthorId order by Price desc) as rn from Books) update cte set Price = Price * 0.9 where rn = 1
