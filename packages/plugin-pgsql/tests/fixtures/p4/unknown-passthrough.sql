create domain posint as integer check (value > 0);

create cast (text as integer) with function int4(text) as implicit;
