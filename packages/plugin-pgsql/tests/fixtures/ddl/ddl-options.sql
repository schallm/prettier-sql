-- Views, index elements, column collations, sequence options, DROP CONCURRENTLY and CTE materialization
create or replace view v (x, "Y") with (security_barrier = true) as select 1, 2 with cascaded check option;
create or replace temp view v as select 1 with local check option;
create view v as select 1 with check option;
create unique index concurrently if not exists i on only t using btree (a desc nulls last, lower(b) text_pattern_ops, c collate "C" nulls first) include (d) nulls not distinct with (fillfactor = 80) tablespace fast where e is not null;
create index i on t ((a + b), (x::text));
create table t (a text collate "C", b text collate pg_catalog."default" not null);
create temp sequence s as bigint start 10 increment -2 minvalue -9223372036854775808 maxvalue 9223372036854775807 cache 5 cycle owned by t.a;
alter sequence s owned by none restart with 100;
drop index concurrently if exists i;
with c as materialized (select 1), d as not materialized (select 2) select * from c, d;
