-- ORDER BY / LIMIT / WITH on a set operation apply to the whole result; parenthesized operands keep their own

select 1 union select 2 intersect select 3 except all (select 4 order by 1 limit 1) order by 1 offset 2;

(select 1 union select 2) intersect select 3;

select 1 except (select 2 except select 3);

with a as (select 1) select * from a union all select 2 order by 1 limit 5;

values (1), (2) order by 1 limit 1;

select a from t order by a fetch first 5 rows with ties;
