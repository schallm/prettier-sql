select f(variadic arr), g(a, variadic b), array_agg(x order by y) from t;
create operator === (leftarg = int, rightarg = int, function = f, commutator = ===, negator = operator(pg_catalog.<>), restrict = eqsel, hashes, merges);
create aggregate a(int) (sfunc = f, stype = int, sortop = <, initcond = '0', finalfunc = s.g, parallel = safe, hypothetical);
create collation c (locale = 'x', deterministic = false);
create function f(c t.a%type) returns u.b%type language sql as 'select 1';
create function f(c t.a%type) returns setof t.a%type language sql as 'select 1';
