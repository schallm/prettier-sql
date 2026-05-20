select id, author_id, price, row_number() over (partition by author_id order by price desc) as rank from books;

select id, price, sum(price) over (order by id rows between unbounded preceding and current row) as running_total from books;

select id, author_id, price, rank() over (partition by author_id order by price desc) as price_rank, avg(price) over (partition by author_id) as avg_price from books;

-- RANGE frame
select id, price, avg(price) over (order by price range between unbounded preceding and current row) as running_avg from books;

-- GROUPS frame
select dept, salary, count(*) over (order by dept groups between 1 preceding and 1 following) as nearby_count from emp;

-- UNBOUNDED FOLLOWING
select id, price, sum(price) over (order by id rows between current row and unbounded following) as suffix_sum from books;

-- N PRECEDING / N FOLLOWING (moving window)
select id, price, avg(price) over (order by id rows between 2 preceding and 2 following) as moving_avg from books;

-- No frame — pure PARTITION BY
select id, author_id, count(*) over (partition by author_id) as author_book_count from books;
