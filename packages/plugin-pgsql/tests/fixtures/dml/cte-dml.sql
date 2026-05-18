with moved as (delete from orders where status = 'cancelled' returning id, customer_id, amount) insert into archived_orders (id, customer_id, amount) select id, customer_id, amount from moved;

with updated as (update users set active = false where last_login < now() - interval '90 days' returning id) delete from sessions where user_id in (select id from updated);
