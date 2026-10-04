select case a.very_long_column_name_one when 1 then 'a very long string result here that goes on and on' when 2 then 'another very long string result for two' else 'a fallback result that is also quite long indeed' end as c from t a;
select case when a.x = 1 then 'short' when a.very_long_column_name_one = 2 then 'a very long string result that does not fit on the line' else 'z' end as c from t a;
select case when a.x = 1 then 'one' else 'other' end as c from t a;
select case when a.x = 1 then case when a.y = 2 then 'nested one' else 'nested other' end else 'outer' end as c from t a;
