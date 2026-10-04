create index concurrently ix_very_long_index_name on some_long_table_name using gin (very_long_column_name_one jsonb_path_ops);
create unique index concurrently if not exists ix_orders_customer_identifier_created_at on only some_schema.orders_table using btree (customer_identifier, created_at) include (status) where deleted_at is null;
create index ix_short on t (a, b);
create index ix_events_with_long_options on events (id) with (fillfactor = 70, deduplicate_items = off);
