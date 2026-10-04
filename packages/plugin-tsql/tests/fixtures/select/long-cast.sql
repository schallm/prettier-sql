select cast(a.very_long_column_name_one + a.very_long_column_name_two + a.very_long_column_name_three as decimal(18, 2)) as c from t a;
select cast(a.very_long_column_name_one as varchar(100)) + try_cast(a.very_long_column_name_two as varchar(100)) as c from t a;
select try_cast(a.very_long_column_name_one + a.very_long_column_name_two + a.very_long_column_name_three as decimal(18, 2)) as c from t a;
select cast(a.x as int) as c, cast(case when a.y = 1 then 'a' else 'b' end as varchar(10)) as d from t a;
