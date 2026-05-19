select id, title, price from books where in_stock = true order by price asc;

select b.id, b.title, a.first_name, a.last_name from books b inner join authors a on b.author_id = a.id where b.price < 50;

-- DISTINCT (non-ON form)
select distinct author_id from books;

select distinct author_id, category from books order by author_id;

-- Parameterized queries
select id, email from users where id = $1 and active = $2;

-- All JOIN types
select * from a join b on a.id = b.a_id left join c on c.b_id = b.id right join d on d.id = c.d_id full join e on e.id = a.e_id cross join f natural join g;

-- USING
select b.id, b.title, a.name from books as b join authors as a using (author_id);
