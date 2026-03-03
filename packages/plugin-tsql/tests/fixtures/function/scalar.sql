create function dbo.GetFullName (@firstName nvarchar(50), @lastName nvarchar(50)) returns nvarchar(101) as begin return @firstName + ' ' + @lastName end
