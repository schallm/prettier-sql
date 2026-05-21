-- INTERSECT ALL (pgsql-specific)
select product_id from orders intersect all select product_id from returns;

-- EXCEPT ALL (pgsql-specific)
select user_id from subscribers except all select user_id from unsubscribed;

-- Set op with ORDER BY and LIMIT on the whole result
select id, name from customers
union all
select id, name from prospects
order by name
limit 100;
