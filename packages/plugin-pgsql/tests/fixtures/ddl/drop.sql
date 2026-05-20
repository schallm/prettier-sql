-- DROP TABLE with CASCADE (pgsql-specific)
drop table if exists temp_data cascade;

-- DROP INDEX (pgsql syntax — no ON clause)
drop index idx_books_author;

drop index if exists idx_books_author;

drop index concurrently if exists idx_large_table;

-- DROP FUNCTION
drop function get_count(integer);

drop function if exists get_count(integer);

-- DROP TYPE
drop type my_status;

drop type if exists my_status cascade;

-- DROP SEQUENCE
drop sequence order_seq;

drop sequence if exists order_seq;
