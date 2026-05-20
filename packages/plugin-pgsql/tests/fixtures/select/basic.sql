select id, title, price from books where in_stock = true order by price asc;

-- Parameterized queries
select id, email from users where id = $1 and active = $2;

-- All JOIN types
select * from books join authors on authors.id = books.author_id left join categories on categories.id = books.category_id right join publishers on publishers.id = books.publisher_id full join orders on orders.book_id = books.id cross join tags natural join reviews;

-- USING
select books.id, books.title, authors.name from books join authors using (author_id);
