select x.* from (values (1, 2), (3, 4)) as v(very_long_column_name_one, very_long_column_name_two, very_long_column_name_three, very_long_four) cross join x;
select x.* from (values (1, 2), (3, 4)) as v(a, b) cross join x;
select s.* from (select 1, 2, 3) as sub_query_alias (very_long_column_name_one, very_long_column_name_two, very_long_column_name_three) cross join x;
select s.* from (select 1, 2) as s (a, b);
