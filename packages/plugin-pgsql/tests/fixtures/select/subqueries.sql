-- Subquery in FROM
select sub.avg_price from (select avg(price) as avg_price from books) as sub;

-- Scalar subquery in column list
select id, (select count(*) from orders where customer_id = c.id) as order_count from customers as c;

-- EXISTS
select id, name from customers where exists (select 1 from orders where orders.customer_id = customers.id);

-- NOT EXISTS
select id, name from customers where not exists (select 1 from orders where orders.customer_id = customers.id);

-- Subquery in WHERE with IN
select id, title from books where author_id in (select id from authors where country = 'US');

-- Correlated subquery
select id, title, price from books as b where price > (select avg(price) from books where author_id = b.author_id);
