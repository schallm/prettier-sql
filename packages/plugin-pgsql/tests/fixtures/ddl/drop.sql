-- DROP TABLE
drop table temp_data;

drop table if exists temp_data;

drop table if exists temp_data cascade;

-- DROP INDEX
drop index idx_books_author;

drop index if exists idx_books_author;

drop index concurrently if exists idx_large_table;

-- DROP FUNCTION
drop function get_count(integer);

drop function if exists get_count(integer);

-- DROP VIEW (basic — fuller coverage in ddl/views.sql)
drop view if exists old_summary;

-- DROP TYPE
drop type my_status;

drop type if exists my_status cascade;

-- DROP SEQUENCE
drop sequence order_seq;

drop sequence if exists order_seq;
