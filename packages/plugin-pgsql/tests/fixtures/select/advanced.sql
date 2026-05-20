-- INTERVAL literals
SELECT INTERVAL '1 day', INTERVAL '2 hours 30 minutes' FROM t;

-- :: cast style (type cast)
SELECT price::numeric, name::text, '2024-01-01'::date FROM t;

-- Array subscript (single index and slice)
SELECT arr[1], arr[2:4], arr[:3], arr[1:] FROM t;

-- Named function arguments
SELECT make_date(year => 2024, month => 1, day => 15);

-- ARRAY constructor
select array[1, 2, 3];
select array['a', 'b', 'c'];

-- ROW constructor
select row(1, 'alice', true);

-- SQL value functions (current_date and session_user are pgsql-accessible)
select current_date, current_timestamp, current_user, session_user from t;

-- GREATEST / LEAST (pgsql multi-arg form)
select greatest(a, b, c), least(x, y, z) from t;

-- AT TIME ZONE
select created_at at time zone 'UTC', updated_at at time zone 'America/New_York' from events;

-- OVERLAY
select overlay(name placing 'XXX' from 2 for 3) from users;
