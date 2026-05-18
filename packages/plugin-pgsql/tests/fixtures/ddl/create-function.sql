-- Simple SQL function
create function get_book_count(p_author_id integer)
returns bigint
language sql
as $$
  select count(*) from books where author_id = p_author_id
$$;

-- Function with multiple parameters
create function full_name(first_name text, last_name text)
returns text
language sql
as $$
  select first_name || ' ' || last_name
$$;
