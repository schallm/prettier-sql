-- A comment on the line a statement ends on stays with that statement
insert into t values (1); -- seed admin
insert into t values (2); /* seed guest */ -- and more
-- on its own line: leads the next statement
select 1; select 2; -- the second
select 3 -- no semicolon
