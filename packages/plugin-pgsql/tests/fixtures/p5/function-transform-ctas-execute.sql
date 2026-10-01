create function f(x int) returns int language sql transform for type int as 'select 1';
create function f(x int) returns int language sql transform for type int, for type text as 'select 1';
create function f(x int) returns int language sql transform for type public.t volatile as 'select 1';
create table x as execute p(1);
create table x as execute p;
create temp table x as execute p(1, 'a') with no data;
create table if not exists x (a, b) as execute p(1);
