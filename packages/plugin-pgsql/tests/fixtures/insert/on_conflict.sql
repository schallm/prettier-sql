insert into users (id, email) values (1, 'alice@example.com') on conflict do nothing;

insert into users (id, email, updated_at) values (1, 'alice@example.com', now()) on conflict (id) do update set email = excluded.email, updated_at = excluded.updated_at;
