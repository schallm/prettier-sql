select id, title from books where author_id in (select id from authors where country = 'USA');

select id, title from books where exists (select 1 from order_items where order_items.book_id = books.id);

select id, title from books where not exists (select 1 from order_items where order_items.book_id = books.id);

select id, title from books where author_id not in (select author_id from banned_authors);

select id, title from books where author_id in (select book_id from order_items where unit_price > 50) and genre_id = (select id from genres where name = 'Fiction');

select id, title, price from books as b where price > (select avg(price) from books where author_id = b.author_id);

select id, (select count(*) from order_items where order_items.book_id = b.id) as order_count from books as b;

select sub.avg_price from (select avg(price) as avg_price from books) as sub;

select id, title from books where price > all (select price from archived_books);

select id, title from books where price = any (select price from featured_books);
