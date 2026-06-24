-- REGEXP_LIKE — ANSI-aligned regex predicate (SQL Server 2025, PostgreSQL)
select regexp_like(email, '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$') as is_valid
from customers;

-- REGEXP_COUNT — count pattern occurrences (SQL Server 2025, PostgreSQL)
select regexp_count(description, '\w+') as word_count
from products;

-- REGEXP_SUBSTR — first matching substring (SQL Server 2025, PostgreSQL)
select regexp_substr(email, '^[^@]+') as username
from customers;

-- REGEXP_REPLACE — replace matched text (3-arg form, SQL Server 2025, PostgreSQL)
select regexp_replace(phone, '[^0-9]', '') as digits_only
from contacts;
