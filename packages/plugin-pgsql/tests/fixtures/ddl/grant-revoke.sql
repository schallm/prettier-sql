-- GRANT on specific tables
grant select, insert on table books to alice;

grant all privileges on table orders to bob;

-- GRANT on schema
grant usage on schema myschema to alice;

-- GRANT on all tables in schema
grant select on all tables in schema public to alice;

-- GRANT to public
grant execute on function get_count(integer) to public;

-- REVOKE
revoke select on table books from alice;

revoke all privileges on table orders from bob cascade;

-- WITH GRANT OPTION
grant select on table books to alice with grant option;
