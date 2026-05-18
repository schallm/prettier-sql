-- COMMENT ON TABLE
comment on table books is 'Book catalog';

-- COMMENT ON COLUMN
comment on column books.title is 'The book''s title';

-- COMMENT ON SCHEMA
comment on schema public is 'Public schema';

-- COMMENT ON FUNCTION
comment on function get_count(integer) is 'Returns count for given id';

-- Remove a comment (IS NULL)
comment on table temp_data is null;
