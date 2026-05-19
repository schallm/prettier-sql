alter function get_count(integer) cost 100;

-- SET ROWS
alter function get_books(integer) rows 100;

-- VOLATILE / STABLE / IMMUTABLE
alter function compute_tax(numeric) volatile;

alter function get_config(text) stable;

alter function format_name(text, text) immutable;

-- RENAME TO
alter function get_count(integer) rename to count_items;

-- OWNER TO
alter function get_count(integer) owner to admin;

-- SET SCHEMA
alter function get_count(integer) set schema reporting;
