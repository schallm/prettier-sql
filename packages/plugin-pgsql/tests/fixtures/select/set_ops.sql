select id, name from customers union select id, name from prospects;

select product_id from orders intersect select product_id from featured_products;

select user_id from premium_users except select user_id from suspended_users;

select id, name from table_a union all select id, name from table_b;

-- Chained UNION (3 operands)
select id, name from customers
union
select id, name from prospects
union
select id, name from leads;

-- INTERSECT ALL
select product_id from orders intersect all select product_id from returns;

-- EXCEPT ALL
select user_id from subscribers except all select user_id from unsubscribed;

-- Set op with ORDER BY and LIMIT on the whole result
select id, name from customers
union all
select id, name from prospects
order by name
limit 100;

-- CTE + UNION
with active as (select id, name from users where active = true)
select id, name from active
union all
select id, name from archived_users;
