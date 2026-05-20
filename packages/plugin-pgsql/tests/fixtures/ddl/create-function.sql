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

-- Function with OUT parameters
create function get_stats(in p_author_id integer, out book_count bigint, out avg_price numeric)
language sql
as $$
  select count(*), avg(price) from books where author_id = p_author_id
$$;

-- Function with INOUT parameter
create function increment(inout val integer)
language sql
as $$
  select val + 1
$$;

-- RETURNS TABLE
create function books_by_author(p_author_id integer)
returns table(id integer, title text, price numeric)
language sql
as $$
  select id, title, price from books where author_id = p_author_id
$$;

-- STABLE, STRICT, SECURITY DEFINER
create function safe_divide(a numeric, b numeric)
returns numeric
language sql
stable
strict
security definer
as $$
  select a / b
$$;
