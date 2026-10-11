-- COLLATE binds tighter than AT TIME ZONE
select (a at time zone 'utc') collate "C", a collate "C" at time zone 'utc' from t;

-- A prefix operator other than - binds more loosely than + and *: @ a + c is @ (a + c)
select (@ a) + c, @ (a + c), (|/ a) * c, - a + c from t;

-- The parser flattens a AND b AND c; a parenthesized nested chain keeps its parentheses
select c and (a and b), c or (a or b), (a and b) and c from t;

-- A BETWEEN bound and a column DEFAULT take a b_expr: no AND, LIKE, AT TIME ZONE, COLLATE, ...
select c between (a at time zone 'utc') and (b collate "C") from t;

create table t (x text default (a like 'b'), y timestamp default (now() at time zone 'utc'), z boolean default (true and false));
