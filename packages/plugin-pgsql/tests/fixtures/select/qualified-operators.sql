-- Schema-qualified operators need OPERATOR() syntax

select a operator(pg_catalog.+) b, a operator(s.===) b * c, a operator(pg_catalog.=) any (array[1]), operator(pg_catalog.-) a;

select a + b * c, (a + b) * c, a operator(pg_catalog.+) b operator(pg_catalog.*) c;
