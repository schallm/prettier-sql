select id, name from customers union select id, name from prospects;

select product_id from orders intersect select product_id from featured_products;

select user_id from premium_users except select user_id from suspended_users;

select id, name from table_a union all select id, name from table_b;
