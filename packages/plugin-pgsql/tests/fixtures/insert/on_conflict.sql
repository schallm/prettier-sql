insert into users (id, email) values (1, 'alice@example.com') on conflict do nothing;

insert into users (id, email, updated_at) values (1, 'alice@example.com', now()) on conflict (id) do update set email = excluded.email, updated_at = excluded.updated_at;

-- ON CONFLICT on constraint name
insert into users (id, email) values (1, 'alice@example.com') on conflict on constraint users_email_key do nothing;

-- ON CONFLICT DO UPDATE with WHERE (partial index target)
insert into products (id, name, price) values (1, 'Widget', 9.99) on conflict (id) where active = true do update set name = excluded.name, price = excluded.price;

-- ON CONFLICT DO UPDATE with WHERE on SET (filter which rows update)
insert into inventory (product_id, quantity) values (1, 10) on conflict (product_id) do update set quantity = inventory.quantity + excluded.quantity where inventory.quantity < 1000;
