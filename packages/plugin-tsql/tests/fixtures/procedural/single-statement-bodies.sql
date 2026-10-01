if 1 = 1 declare @a int = 1, @b varchar(10) else select 2;
while 1 = 0 declare @x int, @y int;
if 1 = 1
begin
  create external language l from (content = 'x', file_name = 'y')
end
begin try
  create external library l from (content = 'x') with (language = 'R')
end try
begin catch
  select case when 1 = 1 then 1 else 2 end
end catch
