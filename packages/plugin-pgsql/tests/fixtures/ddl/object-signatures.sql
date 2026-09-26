-- Argument types identify an overload, and an operator always needs them
drop operator === (int, int);
drop operator if exists @@ (text, none) cascade;
drop operator ~~~ (none, int);
drop function f(int, text);
drop function f();
drop function if exists s.f;
drop function "MyFn"("MyType"), g(int[]);
alter function s.f(int) owner to r;
alter function f(int) set schema x;
comment on function f(int) is 'x';
drop aggregate my_agg(int);
grant execute on function f(int, text) to r;
