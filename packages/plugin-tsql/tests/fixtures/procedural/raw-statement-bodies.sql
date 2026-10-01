if @a = 1
  create external language l from (content = 'x', file_name = 'y');
select 2;
select 3;
go
while @a < 5
  create external language l from (content = 'x', file_name = 'y')
select 2
go
if @x = 1
  select 1
else
  create external language l from (content = 'x', file_name = 'y')
select 2
go
if @x = 1
  create external language l from (content = 'x', file_name = 'y')
else
  select 1
select 2
go
if @x = 1
  create external language l from (content = 'x', file_name = 'y')
else if @x = 2
  create external language m from (content = 'x', file_name = 'y')
else
  create external language n from (content = 'x', file_name = 'y')
select 2
go
create procedure p as
begin
  if @a = 1
    create external language l from (content = 'x', file_name = 'y')
  select 2
  select 3
end
go
create procedure q as
begin
  while @a < 5
    create external language l from (content = 'x', file_name = 'y')
end
go
create procedure r as
begin
  begin try
    if @a = 1 create external language l from (content = 'x', file_name = 'y')
  end try
  begin catch
    select case when 1 = 1 then 2 else 3 end
  end catch
end
go
if @a = 1
  create external language l from (content = 'x', file_name = 'y')
