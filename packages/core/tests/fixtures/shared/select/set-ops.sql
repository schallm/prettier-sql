select id, name from customers union select id, name from prospects;
select id, name from table_a union all select id, name from table_b;
select product_id from orders intersect select product_id from featured_products;
select user_id from premium_users except select user_id from suspended_users;
select id, name from customers union select id, name from prospects union select id, name from leads;
with active as (select id, name from users where active = 1) select id, name from active union all select id, name from archived_users;
