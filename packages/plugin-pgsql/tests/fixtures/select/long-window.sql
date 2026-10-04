select a, row_number() over (partition by a.very_long_column_name_one, a.very_long_column_name_two order by a.very_long_column_name_three desc, a.x) as rn from t a;
select sum(price) over (order by id rows between unbounded preceding and current row) as s, rank() over (partition by a order by b) r from t;
select a, count(*) over (partition by a.very_long_column_name_one, a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_column_name_four) from t;
select a from t window w as (partition by a.very_long_column_name_one, a.very_long_column_name_two order by a.very_long_column_name_three desc, a.x), v as (w order by b);
