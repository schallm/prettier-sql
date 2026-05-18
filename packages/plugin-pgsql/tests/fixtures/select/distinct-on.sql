select distinct on (author_id) id, author_id, title from books order by author_id, price asc;
