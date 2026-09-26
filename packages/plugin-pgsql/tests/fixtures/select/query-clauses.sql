-- NULLS FIRST/LAST, USING, GROUP BY DISTINCT, ESCAPE, WITHIN GROUP, window EXCLUDE and inheritance, NATURAL outer joins, join aliases and nested joins
select distinct on (a) a, b from t order by a, b desc nulls last, c nulls first;
select * from t order by a using <, b using ~>~ nulls first;
select a, count(*) from t group by distinct rollup (a, b), cube (c);
select 1 from t where a similar to 'x#%%' escape '#' and b not similar to 'y';
select 1 from t where a like 'x!%' escape '!' and b not ilike 'z' escape '\';
select percentile_cont(0.5) within group (order by x desc), mode() within group (order by y) from t;
select array_agg(x order by y desc) from t;
select row_number() over (partition by a order by b rows between unbounded preceding and current row exclude current row), sum(x) over (order by y groups 1 preceding exclude ties) from t;
select x, rank() over (w2 rows unbounded preceding) from t window w as (partition by a), w2 as (w order by b);
select * from t natural left join u natural full join v;
select * from t left join u using (id) as j where j.id > 1;
select * from (t join u on t.id = u.id) as tu(a, b);
select * from t join u join v on u.id = v.id on t.id = u.id;
select * from t left join (u cross join v) on true;
