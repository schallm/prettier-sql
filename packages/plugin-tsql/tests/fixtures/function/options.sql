-- Function options: INLINE = ON | OFF keeps its value
create function dbo.f (@a int) returns int with returns null on null input, inline = off as begin return @a; end;
go
create function dbo.g (@a int) returns int with inline = on, schemabinding as begin return @a; end;
