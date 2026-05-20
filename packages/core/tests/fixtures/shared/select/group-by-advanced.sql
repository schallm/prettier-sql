select genre_id, sum(price) as total from books group by rollup(genre_id);

select genre_id, author_id, sum(price) as total from books group by cube(genre_id, author_id);

select genre_id, author_id, sum(price) as total from books group by grouping sets ((genre_id, author_id), (genre_id), ());

select genre_id, author_id, count(*) as book_count from books group by rollup(genre_id, author_id);
