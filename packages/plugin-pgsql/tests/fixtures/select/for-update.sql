select id, title from books where id = 1 for update;

select id, title from books for share skip locked;

select id from orders for no key update of orders nowait;

-- FOR KEY SHARE
select id from accounts for key share;

-- FOR UPDATE OF multiple tables
select o.id, i.id from orders as o join order_items as i on o.id = i.order_id for update of o;
