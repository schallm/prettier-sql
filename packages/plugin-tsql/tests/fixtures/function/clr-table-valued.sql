-- A CLR table-valued function lists its result columns
create function dbo.clr_tvf (@a int)
returns table (a int, b nvarchar(10))
as external name asm.cls.mth
