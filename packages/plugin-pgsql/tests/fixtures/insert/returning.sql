insert into users (name, email) values ('Alice', 'alice@example.com') returning id;

insert into orders (customer_id, amount) values (42, 150.00) returning id, created_at;
