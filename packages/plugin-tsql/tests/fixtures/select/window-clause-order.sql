-- WINDOW comes after HAVING and before ORDER BY
select a, sum(a) over w from t group by a having count(*) > 1 window w as (partition by a) order by sum(a) over w;
select a from t window w as (partition by b), w2 as (w order by c) order by a offset 1 rows;
