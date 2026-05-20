select b.id, b.title, a.first_name, a.last_name from books as b inner join authors as a on b.author_id = a.id;

select b.title, a.first_name from books as b left join authors as a on b.author_id = a.id where a.id is null;

select b.title, a.first_name from books as b full join authors as a on b.author_id = a.id;

select b.title, g.name from books as b right join genres as g on b.genre_id = g.id;

select b.title, g.name from books as b cross join genres as g;

select b.title, recent.total from books as b inner join (select book_id, sum(quantity) as total from order_items group by book_id) as recent on b.id = recent.book_id;

select b.title, a.last_name, p.name as publisher from books as b inner join authors as a on b.author_id = a.id inner join publishers as p on b.publisher_id = p.id where b.in_stock = 1 order by a.last_name, b.title;
