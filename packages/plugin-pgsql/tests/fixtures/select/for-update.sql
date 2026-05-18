select id, title from books where id = 1 for update;

select id, title from books for share skip locked;

select id from orders for no key update of orders nowait;
