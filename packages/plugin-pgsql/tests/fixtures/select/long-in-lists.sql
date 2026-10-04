select a from t where a.very_long_column_name_one in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25);
select a from t where a.very_long_column_name_one = any(array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
select a from t where a.x in (a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, 4);
select array[a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, 4] as x;
select a from t where a in (1, 2, 3);
