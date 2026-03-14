-- INNER JOIN (keyword form)
select b.Id, b.Title, a.LastName
from Books as b
inner join Authors as a on b.AuthorId = a.Id
where b.InStock = 1
order by b.Title asc;

-- LEFT JOIN with aliased columns
select b.Title, p.Name as Publisher
from Books as b
left join Publishers as p on b.PublisherId = p.Id;

-- RIGHT JOIN
select b.Title, g.Name as Genre
from Books as b
right join Genres as g on b.GenreId = g.Id;

-- FULL OUTER JOIN
select b.Title, a.LastName
from Books as b
full outer join Authors as a on b.AuthorId = a.Id;

-- CROSS JOIN
select b.Title, g.Name
from Books as b
cross join Genres as g;

-- Multiple joins on the same table
select b.Title, a.LastName, p.Name as Publisher, g.Name as Genre
from Books as b
inner join Authors as a on b.AuthorId = a.Id
inner join Publishers as p on b.PublisherId = p.Id
inner join Genres as g on b.GenreId = g.Id
where b.InStock = 1;

-- JOIN with multiple ON predicates (AND)
select b.Title, oi.Quantity
from Books as b
inner join OrderItems as oi on b.Id = oi.BookId and oi.UnitPrice > 10 and oi.Quantity > 1;

-- Self-join
select b1.Title as Original, b2.Title as Companion
from Books as b1
inner join Books as b2 on b1.AuthorId = b2.AuthorId and b1.Id <> b2.Id;

-- JOIN with subquery (derived table)
select b.Title, recent.Total
from Books as b
inner join (
    select BookId, sum(Quantity) as Total
    from OrderItems
    group by BookId
) as recent on b.Id = recent.BookId;

-- CROSS APPLY
select b.Title, top5.OrderId
from Books as b
cross apply (
    select top 5 OrderId
    from OrderItems
    where BookId = b.Id
    order by UnitPrice desc
) as top5;

-- OUTER APPLY
select b.Title, latest.OrderId
from Books as b
outer apply (
    select top 1 OrderId
    from OrderItems
    where BookId = b.Id
    order by UnitPrice desc
) as latest;

-- JOIN with table hint
select b.Title, a.LastName
from Books as b with (nolock)
inner join Authors as a with (nolock) on b.AuthorId = a.Id;

-- Three-way join with WHERE and ORDER BY
select b.Title, a.LastName, o.Total
from Orders as o
inner join OrderItems as oi on o.Id = oi.OrderId
inner join Books as b on oi.BookId = b.Id
inner join Authors as a on b.AuthorId = a.Id
where o.Status = 'Shipped'
order by o.OrderDate desc, b.Title asc;

-- UPDATE with JOIN (join-based update)
update Books
set InStock = 0
from Books as b
inner join Publishers as p on b.PublisherId = p.Id
where p.Country = 'UK';
