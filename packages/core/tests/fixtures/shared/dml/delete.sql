delete from books where in_stock = 0 and price < 5;

delete from order_items where order_id in (select id from orders where status = 'cancelled');

delete from sessions where exists (select 1 from users where users.id = sessions.user_id and users.active = 0);
