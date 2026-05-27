create function dbo.FormatPhone(@phone nvarchar(20)) returns nvarchar(20) external name MyClrLib.[MyNamespace.MyClass].FormatPhone
go
create function dbo.FormatPhone(@phone nvarchar(20)) returns nvarchar(20) with schemabinding external name MyClrLib.[MyNamespace.MyClass].FormatPhone
go
alter function dbo.FormatPhone(@phone nvarchar(20)) returns nvarchar(20) external name MyClrLib.[MyNamespace.MyClass].FormatPhone
