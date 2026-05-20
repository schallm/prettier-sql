select id, title from books where author_id in (select id from authors where country = 'USA');

select id, title from books where exists (select 1 from order_items where order_items.book_id = books.id);

select id, title from books where author_id not in (select author_id from banned_authors);
