select a.id from t a where a.very_long_column_name_one between 100000000000000000 and 200000000000000000 and a.x = 1;
select a.id from t a where a.very_long_column_name_one not between a.very_long_lower_bound_column_name and a.very_long_upper_bound_column_name;
select a.id from t a where a.x between 1 and 10;
select a.id from t a where a.created_at between a.start_date + a.very_long_offset_column_name and a.end_date + a.very_long_offset_two;
