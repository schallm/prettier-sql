-- Function parameters keep their defaults
create function dbo.f (@a int = 1, @b varchar(10) = 'x', @t dbo.TT readonly) returns table as return (select @a as a);
go
create function dbo.g (@a int = null) returns int as begin return @a; end;
