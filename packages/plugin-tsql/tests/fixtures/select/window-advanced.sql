select first_value(Price) ignore nulls over (partition by AuthorId order by PublishedDate) from Books

select last_value(Price) respect nulls over (order by PublishedDate) from Books

select first_value(Price) ignore nulls over (partition by AuthorId order by PublishedDate rows between unbounded preceding and current row) from Books

select last_value(Price) ignore nulls over w from Books window w as (partition by AuthorId order by PublishedDate)
