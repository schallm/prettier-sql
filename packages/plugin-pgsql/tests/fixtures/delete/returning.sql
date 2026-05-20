-- Basic DELETE (no RETURNING)
delete from sessions where expires_at < now();

-- DELETE with RETURNING
delete from sessions where expires_at < now() returning id, user_id;

-- DELETE with USING
delete from order_items using orders where order_items.order_id = orders.id and orders.status = 'cancelled';
