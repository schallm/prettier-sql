select coalesce(a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_column_name_four) as c from t a;
select iif(a.very_long_column_name_one > a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_column_name_four) as c from t a;
select nullif(a.very_long_column_name_one + a.very_long_column_name_two, a.very_long_column_name_three + a.very_long_column_name_four) as c from t a;
select convert(varchar(100), a.very_long_column_name_one + a.very_long_column_name_two + a.very_long_column_name_three, 120) as c from t a;
select try_convert(varchar(100), a.very_long_column_name_one, 120), coalesce(a, b), iif(a > b, 1, 2) from t a;
