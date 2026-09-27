-- Unbounded bpchar and bit keep their qualified names; char and bit alone mean length 1
select x::pg_catalog.bpchar, y::pg_catalog.bit, z::char, w::char(3), v::bit, u::bit(4);
