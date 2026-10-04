select coalesce(a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_column_name_four) as c from t a;
select string_agg(a.very_long_column_name_one, ', ' order by a.very_long_column_name_two, a.very_long_column_name_three) as agg from t a;
select jsonb_build_object('key_one', a.very_long_column_name_one, 'key_two', a.very_long_column_name_two, 'key_three', a.three) as j from t a;
select coalesce(a, b), lower(trim(a.very_long_column_name_one_that_is_long_enough_to_pass_the_width_limit_x)) from t a;
select sum(case when a = 1 then 1 else 0 end), now(), count(*) from t;
