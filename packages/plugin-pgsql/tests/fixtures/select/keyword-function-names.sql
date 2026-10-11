-- Functions named like a COL_NAME keyword: bare, these are SQL-standard syntax or a
-- syntax error, so they stay quoted. After a schema, any keyword is a valid name.
select "position"(a, b), "trim"(a), "extract"('year', a), "char"(a), "timestamp"('2020'), s.position(a, b) from t;

-- substring and overlay also take a plain argument list bare
select substring(a, 1, 2), "substring"(a, 1, 2), overlay(a, b, 1), substring(a from 1 for 2) from t;

create function "position"(int) returns int language sql as 'select 1';

drop function "trim"(text);

create collation "left" (locale = 'C');
