with moved as (delete from orders where status = 'cancelled' returning id, customer_id, amount) insert into archived_orders (id, customer_id, amount) select id, customer_id, amount from moved;

with updated as (update users set active = false where last_login < now() - interval '90 days' returning id) delete from sessions where user_id in (select id from updated);

-- WITH ... INSERT (insert from CTE)
with new_data as (select customer_id, sum(amount) as total from raw_orders group by customer_id) insert into order_summary (customer_id, total) select customer_id, total from new_data;

-- WITH ... UPDATE
with stale as (select id from sessions where expires_at < now()) update sessions set active = false where id in (select id from stale);
