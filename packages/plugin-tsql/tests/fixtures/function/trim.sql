create function dbo.TrimCharsFrom (@str nvarchar(max)) returns nvarchar(max) as begin return trim(nchar(12288) from @str) end
