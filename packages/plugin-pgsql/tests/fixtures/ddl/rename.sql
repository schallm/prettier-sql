-- ALTER ... RENAME for each kind of object

alter table if exists only t rename to u;

alter table t rename column a to b;

alter view v rename column a to b;

alter materialized view if exists mv rename to mv2;

alter table t rename constraint c to d;

alter foreign table ft rename to ft2;

alter index if exists i rename to j;

alter sequence s rename to s2;

alter schema s rename to s2;

alter database d rename to d2;

alter role r rename to r2;

alter tablespace ts rename to ts2;

alter trigger tr on s.t rename to tr2;

alter policy p on t rename to p2;

alter rule r on t rename to r2;

alter type addr rename attribute zip to postal cascade;

alter domain d rename constraint c to c2;

alter type t rename to t2;

alter function f(int, text) rename to g;

alter procedure p rename to q;

alter aggregate a(*) rename to b;

alter aggregate my_sum(int) rename to b;

alter operator class oc using btree rename to oc2;

alter text search configuration cfg rename to cfg2;

alter server s rename to s2;

alter language l rename to l2;

alter collation c rename to c2;

alter publication p rename to p2;

alter statistics st rename to st2;

alter conversion c rename to c2;

alter event trigger e rename to e2;
