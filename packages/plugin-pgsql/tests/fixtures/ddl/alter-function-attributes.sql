-- SECURITY DEFINER must not flip to INVOKER; attributes print as written
alter function f(int) security definer;
alter function f(int) security invoker;
alter function f immutable strict;
alter function s.f(int, text) set search_path = 'MySchema', public;
alter function f(int) reset all;
alter function f() cost 100 rows 10 parallel safe leakproof;
alter procedure p(int) security definer;
