insert into orders (customer_id, total) values (1, 99.99);

insert into products (name, price, category) values ('Widget', 9.99, 'tools'), ('Gadget', 19.99, 'electronics'), ('Doohickey', 4.99, 'misc');

-- INSERT ... SELECT
insert into archived_orders (id, customer_id, amount) select id, customer_id, amount from orders where status = 'closed';

-- DEFAULT VALUES
insert into audit_log default values;

-- OVERRIDING SYSTEM VALUE
insert into users (id, email) overriding system value values (100, 'admin@example.com');

-- OVERRIDING USER VALUE
insert into users (id, email) overriding user value values (101, 'user@example.com');
