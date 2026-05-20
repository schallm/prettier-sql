create view AvailableBooks as
select
    b.Id,
    b.Title,
    b.Price,
    a.Name as AuthorName
from Books as b
inner join Authors as a
    on b.AuthorId = a.Id
where b.InStock = 1
