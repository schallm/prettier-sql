select id, author_id, price, row_number() over (partition by author_id order by price desc) as rn from books;
select id, author_id, price, rank() over (partition by author_id order by price desc) as price_rank, dense_rank() over (partition by author_id order by price desc) as price_dense_rank, avg(price) over (partition by author_id) as avg_price from books;
select id, price, sum(price) over (order by id rows between unbounded preceding and current row) as running_total from books;
select id, price, avg(price) over (order by price range between unbounded preceding and current row) as running_avg from books;
select id, price, sum(price) over (order by id rows between current row and unbounded following) as suffix_sum from books;
select id, price, avg(price) over (order by id rows between 2 preceding and 2 following) as moving_avg from books;
select id, author_id, count(*) over (partition by author_id) as author_book_count from books;
select id, price, sum(price) over w as total, row_number() over w as rn from books window w as (partition by author_id order by price);
