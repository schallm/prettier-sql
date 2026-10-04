select a.id, row_number() over (partition by a.account_id, a.region_id order by a.created_at desc, a.id) as rn from t a;
select a.id, count(*) over (partition by a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, a.four) as c from t a;
select a.id, sum(a.x) over (partition by a.account_id) as s from t a;
select a.id from t a window w as (partition by a.account_id, a.region_id order by a.created_at), v as (partition by a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three);
