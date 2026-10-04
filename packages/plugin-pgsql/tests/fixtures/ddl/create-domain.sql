create domain some_long_domain_name as text constraint some_long_check_name check (value ~ '^[a-z]+$' and length(value) > 3 and length(value) < 50);
create domain posint as integer check (value > 0);
create domain s.d as varchar(20) collate "C" default 'x' not null constraint c1 check (value <> '') constraint c2 check (length(value) < 10);
create domain d2 as numeric(10, 2) null default 0;
create domain d3 as text[] not null;
create domain "Mixed" as pg_catalog.int4;
