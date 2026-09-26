-- Pseudo-columns, GROUP BY ALL / WITH ROLLUP, INSERT TOP, EXEC WITH RECOMPILE
select $action, $identity from t;
select a from t group by all a;
select a, sum(b) from t group by a with rollup;
insert top (10) into t (a) select a from u;
insert top (10) percent into t (a) select a from u;
exec dbo.p @a = 1 with recompile;

-- SET options combine as flags
set nocount, xact_abort on;

-- OUTPUT comes before FROM; @var = col = expr; col.WRITE(...)
update t set a = 1, @v = c = 3 output deleted.a from t join u on t.id = u.id where t.x = 1;
update t set a.write('x', 0, 1) where 1 = 0;
delete t output deleted.a from t join u on t.id = u.id;

-- A DROP list can mix constraints and columns
alter table t drop constraint if exists ck, column if exists b;
alter table t drop ck1, ck2, column c, d;

-- Variables in hints keep their case
select a from t option (optimize for (@MyParam = 1));
