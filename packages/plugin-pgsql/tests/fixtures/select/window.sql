select id, author_id, price, row_number() over (partition by author_id order by price desc) as rank from books;

select id, price, sum(price) over (order by id rows between unbounded preceding and current row) as running_total from books;

select id, author_id, price, rank() over (partition by author_id order by price desc) as price_rank, avg(price) over (partition by author_id) as avg_price from books;
