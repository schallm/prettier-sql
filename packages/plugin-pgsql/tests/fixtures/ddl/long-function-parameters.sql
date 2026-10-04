create function f(very_long_argument_one integer, very_long_argument_two text, very_long_argument_three boolean) returns integer language sql as 'select 1';
create or replace function get_stats(in p_author_id integer, out book_count bigint, out avg_price numeric) language sql as 'select 1, 2';
create function g(a integer) returns table (very_long_column_name_one integer, very_long_column_name_two text, very_long_column_name_three boolean) language sql as 'select 1, 2, 3';
create function h(a integer, b text) returns integer language sql as 'select 1';
create procedure p(very_long_argument_one integer, very_long_argument_two text, very_long_argument_three boolean) language sql as 'select 1';
