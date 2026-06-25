-- JSON_OBJECT constructor (SQL/JSON standard, PostgreSQL 16+)
select json_object('title' value b.title, 'author' value a.name)
from books b
join authors a on a.id = b.author_id;

-- JSON_OBJECT with ABSENT ON NULL
select json_object('title' value b.title, 'subtitle' value b.subtitle absent on null)
from books b;

-- JSON_OBJECT aggregate
select a.name, json_objectagg(b.isbn value b.title)
from authors a
join books b on b.author_id = a.id
group by a.name;

-- JSON_ARRAY aggregate
select a.name, json_arrayagg(b.title)
from authors a
join books b on b.author_id = a.id
group by a.name;

-- JSON_ARRAY aggregate with ABSENT ON NULL
select a.name, json_arrayagg(b.subtitle absent on null)
from authors a
join books b on b.author_id = a.id
group by a.name;
