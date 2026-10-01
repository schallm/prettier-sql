create schema s create table t (a int) create view v as select 1;
create schema s authorization u create table t (a int primary key) create index i on t (a) create sequence q create trigger tg before insert on t for each row execute function f() grant select on t to u;
create schema if not exists s;
