select * from generate_series(1, 100) as very_long_alias_name(very_long_column_name_one, very_long_column_name_two, three);
select * from (select 1, 2, 3) as sub_query_alias(very_long_column_name_one, very_long_column_name_two, very_long_column_name_three);
select * from t as short_alias(a, b);
select * from unnest(array[1, 2]) as u(very_long_column_name_one, very_long_column_name_two, very_long_column_name_three, four);
select * from a join b using (very_long_column_name_one, very_long_column_name_two, very_long_column_name_three, four);
select * from json_to_recordset('[]') as x(very_long_column_name_one integer, very_long_column_name_two text, very_long_column_name_three boolean);
