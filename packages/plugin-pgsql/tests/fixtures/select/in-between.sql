select id, title from books where id in (1, 2, 3);

select id, title from books where id not in (1, 2, 3);

select id, title, price from books where price between 10 and 50;

select id, title, price from books where price not between 10 and 50;

-- ANY / ALL
select id, title from books where price = any (array[9.99, 19.99, 29.99]);

select id, title from books where price > all (select price from books where author_id = 5);

-- IS NULL / IS NOT NULL
select id, title from books where deleted_at is null;

select id, title from books where deleted_at is not null;

-- IS DISTINCT FROM / IS NOT DISTINCT FROM
select id from t where a is distinct from b;

select id from t where a is not distinct from b;

-- SIMILAR TO
select id, email from users where email similar to '%@(gmail|yahoo)\.com';

select id, email from users where email not similar to '%@(gmail|yahoo)\.com';
