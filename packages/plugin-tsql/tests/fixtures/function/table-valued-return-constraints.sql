-- A multi-statement table-valued function's result table keeps its indexes and constraints
create function dbo.f ()
returns @t table (a int not null, b int, c int, primary key (a), unique (c), index ix (b))
as
begin
  return
end
