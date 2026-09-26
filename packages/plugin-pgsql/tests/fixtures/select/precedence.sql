-- libpg_query drops parentheses from the AST; the printer must put them back
select (a + b) * c, a * (b + c), a - (b - c), (a - b) - c, a / (b / c), a ^ (b ^ c) from t;
select -(a + b), -(-a), (-1)::int, (a + b)::text, (a || b) || c, (a || b) + 1 from t;
select (a = 1) = (b = 1), (a = b) is null, a = b is true from t;
select (ts at time zone 'utc') at time zone 'est', (f(x))[1], (t.rec).field from t;
select 1 from t where not (a = 1 and b = 2);
select 1 from t where a = 1 and (b = 2 or c = 3);
select 1 from t where (price < 10 or price > 100) and deleted_at is null;
select 1 from t where a between (b + 1) and (c * 2) and (x like y) = true;
select 1 from t join u on (t.a = u.a or t.b = u.b) and t.c = 1;
select case when (a or b) and c then 1 end from t;
select count(*) filter (where (a or b) and c) from t having (count(*) > 1 or sum(x) > 2) and max(y) < 3;
update t set a = (b + c) * 2 where (x or y) and z;
select a is true, a is not false, a is unknown, a is not unknown from t;
