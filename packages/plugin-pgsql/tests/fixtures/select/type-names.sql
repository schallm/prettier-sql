-- Types spelled with SQL keywords vs internal names: each must keep resolving the same way

select x::"char", x::char, x::float8, x::int4, x::int[3], x::"int", x::pg_catalog.text, x::timestamp(2) with time zone, x::bit varying(5), x::interval day to second(3);

select '1 day'::interval, interval '1' year, x::interval(3), x::interval[];

create table t (a float8, b "char", c int4[3], d timestamptz(0));
