-- A VALUES query keeps its WITH clause
with c as (select 1 as a) values (1), (2);

with recursive r (n) as (select 1) values ((select n from r)) order by 1 limit 1;

insert into t values (1);
