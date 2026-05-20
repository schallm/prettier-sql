create function GetAuthorFullName (@FirstName nvarchar(50), @LastName nvarchar(50)) returns nvarchar(101) as begin return @FirstName + ' ' + @LastName end
