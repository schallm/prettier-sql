select id, title, price from books where in_stock = true order by price asc;

select b.id, b.title, a.first_name, a.last_name from books b inner join authors a on b.author_id = a.id where b.price < 50;
