select array_agg(a.very_long_column_name_one order by a.very_long_column_name_two) filter (where a.x > 1) as agg from t a;
select string_agg(a.very_long_column_name_one, ', ' order by a.very_long_column_name_two, a.very_long_column_name_three) as agg from t a;
select array_agg(a.x order by a.y) as agg, count(*) filter (where a.status = 'active') as active from t a;
select sum(a.amount) filter (where a.very_long_column_name_one = 'some long value' and a.very_long_column_name_two > 100) as total from t a;
select sum(a.amount) filter (where a.x > 1) over (partition by a.account_id) as running from t a;
