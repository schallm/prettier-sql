-- Basic index
create index idx_books_author on books (author_id);

-- Unique index
create unique index idx_users_email on users (email);

-- Multi-column index
create index idx_orders_customer_status on orders (customer_id, status);

-- Descending column
create index idx_orders_recent on orders (created_at desc);

-- Expression index
create index idx_users_lower_email on users (lower(email));

-- Partial index (WHERE clause)
create index idx_active_users on users (email) where active = true;

-- INCLUDE columns (covering index)
create index idx_orders_lookup on orders (customer_id) include (status, amount);

-- Specific index method
create index idx_events_data on events using gin (data);

create index idx_locations on places using gist (location);

-- CREATE INDEX CONCURRENTLY
create index concurrently idx_big_table_col on big_table (col);

-- IF NOT EXISTS
create index if not exists idx_books_author on books (author_id);
