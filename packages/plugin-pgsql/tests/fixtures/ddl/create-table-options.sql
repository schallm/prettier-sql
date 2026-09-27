-- Persistence, IF NOT EXISTS, INHERITS and storage clauses change what CREATE TABLE creates
create temp table t (a int) on commit drop;
create temporary table if not exists t (a int) on commit delete rows;
create unlogged table t (a int);
create table if not exists t (like u including all);
create table t (like u including all excluding comments);
create table t (like u including comments including indexes);
create table t (a int) inherits (u, s.v);
create table t (a int) with (fillfactor = 70, toast.autovacuum_enabled = false) tablespace "Fast";
create table t (a int) using heap;
create temp table t as select 1;
create unlogged table t (x, y) with (fillfactor = 50) as select 1, 2 with no data;
create materialized view mv (x) as select 1 with no data;
create materialized view if not exists mv as select 1;
