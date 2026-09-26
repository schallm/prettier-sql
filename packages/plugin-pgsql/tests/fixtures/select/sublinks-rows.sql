-- ARRAY(subquery), row comparisons, IN vs = ANY, ROW(...), field selection

select array(select 1);

select (f(x)).*, (t).* from t;

select row(1), row(1, 2), (1, 2);

select (a, b) < (select 1, 2) from t;

select 1 from t where a = any (select 1) and a in (select 2) and a <> all (select 3);

select trim(both from x), trim(leading 'x' from y), pg_catalog.ltrim(z);
