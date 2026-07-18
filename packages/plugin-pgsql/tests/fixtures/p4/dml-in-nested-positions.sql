with x as (
  merge into t using s on t.id = s.id when matched then delete
)
select 1;

copy (
  merge into t using s on t.id = s.id when matched then update set x = 1 returning x
) to stdout;

prepare p as
merge into t using s on t.id = s.id when matched then delete;

explain create materialized view mv as
select 1;

explain execute p;

explain declare c cursor for
select 1;
