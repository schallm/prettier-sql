-- Expression index (pgsql-specific)
create index idx_users_lower_email on users (lower(email));

-- INCLUDE columns (covering index)
create index idx_orders_lookup on orders (customer_id) include (status, amount);

-- Specific index method
create index idx_events_data on events using gin (data);

create index idx_locations on places using gist (location);

-- CREATE INDEX CONCURRENTLY
create index concurrently idx_big_table_col on big_table (col);

-- IF NOT EXISTS
create index if not exists idx_books_author on books (author_id);
