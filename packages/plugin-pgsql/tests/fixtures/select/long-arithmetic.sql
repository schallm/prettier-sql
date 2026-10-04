select a.very_long_column_name_one + a.very_long_column_name_two * a.very_long_column_name_three - a.very_long_column_name_four as total from t a;
select a.very_long_column_name_one || ' - ' || a.very_long_column_name_two || ' - ' || a.very_long_column_name_three as c from t a;
select a + b - c, a * b + c as d from t;
select a from t where a.very_long_column_name_one + a.very_long_column_name_two - a.very_long_column_name_three > 1000000;
