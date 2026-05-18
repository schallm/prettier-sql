select author_id, count(*) as book_count, avg(price) as avg_price from books where in_stock = 1 group by author_id having count(*) > 5 order by book_count desc;
