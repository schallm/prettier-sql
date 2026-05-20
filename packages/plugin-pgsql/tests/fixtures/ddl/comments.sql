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

-- COMMENT ON VIEW
comment on view active_users is 'Users with active accounts';

-- COMMENT ON INDEX
comment on index idx_books_author is 'Author lookup index';

-- COMMENT ON SEQUENCE
comment on sequence order_seq is 'Order ID sequence';

-- COMMENT ON TYPE
comment on type order_status is 'Possible order states';

-- COMMENT ON DATABASE
comment on database mydb is 'Main application database';
