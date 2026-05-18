-- SUBSTRING: regex form (FROM pattern)
SELECT SUBSTRING(title FROM 'pg.*') FROM books;

-- SUBSTRING: positional form (FROM pos FOR len)
SELECT SUBSTRING(title FROM 1 FOR 5) FROM books;

-- EXTRACT
SELECT EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at), EXTRACT(DAY FROM created_at) FROM orders;

-- TRIM variants
SELECT TRIM(LEADING ' ' FROM name), TRIM(TRAILING ' ' FROM name), TRIM(BOTH ' ' FROM name) FROM users;

-- TRIM without chars (single-arg form)
SELECT TRIM(name), TRIM(LEADING FROM name), TRIM(TRAILING FROM name) FROM users;

-- POSITION
SELECT POSITION('.' IN email) FROM users;

-- AT TIME ZONE
SELECT created_at AT TIME ZONE 'UTC', updated_at AT TIME ZONE 'America/New_York' FROM events;

-- OVERLAY
SELECT OVERLAY(name PLACING 'XXX' FROM 2 FOR 3) FROM users;

-- CURRENT_DATE / CURRENT_TIMESTAMP / other SQL value functions
SELECT CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIME FROM t;
SELECT LOCALTIME, LOCALTIMESTAMP, CURRENT_USER, SESSION_USER FROM t;

-- Regular functions (no special rewriting needed)
SELECT UPPER(name), LOWER(email), LENGTH(title) FROM books;
SELECT COALESCE(price, 0.00), NULLIF(status, 'deleted') FROM products;
SELECT GREATEST(a, b, c), LEAST(x, y) FROM scores;
SELECT DATE_TRUNC('month', created_at) FROM orders;
SELECT NOW(), TO_CHAR(price, 'FM999.00'), TO_TIMESTAMP(epoch) FROM t;
SELECT REGEXP_REPLACE(name, '\s+', ' ', 'g') FROM users;
