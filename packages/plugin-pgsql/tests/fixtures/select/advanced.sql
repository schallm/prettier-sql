-- INTERVAL literals
SELECT INTERVAL '1 day', INTERVAL '2 hours 30 minutes' FROM t;

-- :: cast style (type cast)
SELECT price::numeric, name::text, '2024-01-01'::date FROM t;

-- Array subscript (single index and slice)
SELECT arr[1], arr[2:4], arr[:3], arr[1:] FROM t;

-- Named function arguments
SELECT make_date(year => 2024, month => 1, day => 15);

-- ROLLUP / CUBE / GROUPING SETS
SELECT dept, SUM(salary) FROM emp GROUP BY ROLLUP(dept);
SELECT dept, job, SUM(salary) FROM emp GROUP BY CUBE(dept, job);
SELECT dept, job, SUM(salary) FROM emp GROUP BY GROUPING SETS ((dept, job), (dept), ());

-- ARRAY constructor
select array[1, 2, 3];
select array['a', 'b', 'c'];

-- ROW constructor
select row(1, 'alice', true);

-- SQL value functions
select current_date, current_timestamp, current_user, session_user from t;

-- COALESCE / NULLIF / GREATEST / LEAST
select coalesce(price, 0.00), nullif(status, 'deleted'), greatest(a, b, c), least(x, y, z) from t;

-- CASE searched form
select id, case when price < 10 then 'budget' when price < 50 then 'mid-range' else 'premium' end as tier from books;

-- CASE simple form
select id, case status when 'active' then 1 when 'inactive' then 0 else -1 end from users;

-- AT TIME ZONE
select created_at at time zone 'UTC', updated_at at time zone 'America/New_York' from events;

-- OVERLAY
select overlay(name placing 'XXX' from 2 for 3) from users;
