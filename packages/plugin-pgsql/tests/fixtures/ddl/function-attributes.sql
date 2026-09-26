-- OR REPLACE, procedures, attributes (volatility, STRICT, SECURITY DEFINER, ...), SETOF, parameter defaults, C symbols and $$ inside a body
create or replace function f(a int default 1, in b text = 'x', out c int) returns setof int language plpgsql immutable strict security definer parallel safe cost 10 rows 5 set search_path = "MySchema", pg_temp as $$ begin end $$;
create function g() returns int language c stable leakproof called on null input security invoker as 'mylib', 'g_impl';
create function h() returns text language sql as $x$ select '$$' $x$;
create function k(variadic xs int[]) returns table (x int, y text) language sql set work_mem from current as 'select 1, ''a''';
create procedure p(inout n int) language plpgsql as $$ begin n := n + 1; end $$;
create or replace procedure q() language sql security definer as 'select 1';
