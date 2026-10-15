select json_object('name': Title, 'price': Price) from Books

select json_object('name': Title, 'price': Price absent on null) from Books

select json_object('id': Id null on null) from Books

select json_array(1, 2, 'three')

select json_array(1, 2, 'three' absent on null)

select json_arrayagg(Title) from Books

select json_arrayagg(Title order by Title) from Books

select json_arrayagg(Title order by Title absent on null) from Books

-- JSON_OBJECTAGG — SQL Server 2025
select json_objectagg(Name: Value)
from Config
group by Name

select json_objectagg(Name: Value null on null)
from Config
group by Name

-- JSON aggregates as window functions keep OVER
select json_objectagg(Title: Price null on null) over (partition by AuthorId) from dbo.Books;
select json_arrayagg(Title order by Title null on null returning json) over (partition by AuthorId) from dbo.Books;
select json_arrayagg(Title) over (partition by AuthorId) from dbo.Books;
