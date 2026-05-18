select author_id, count(*) filter (where in_stock = 1) as in_stock_count, count(*) filter (where in_stock = 0) as out_of_stock_count from books group by author_id;

select author_id, string_agg(title, ', ' order by title) as titles from books group by author_id;
