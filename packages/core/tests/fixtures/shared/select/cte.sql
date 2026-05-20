with top_authors as (select author_id, count(*) as book_count from books group by author_id having count(*) > 5) select a.first_name, a.last_name, t.book_count from authors as a inner join top_authors as t on a.id = t.author_id order by t.book_count desc;

with bestsellers as (select author_id, count(*) as book_count from books where in_stock = 1 group by author_id), top_authors as (select author_id from bestsellers where book_count > 3) select a.first_name, a.last_name from authors as a inner join top_authors as t on a.id = t.author_id;
