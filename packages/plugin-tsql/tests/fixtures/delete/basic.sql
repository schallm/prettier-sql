delete from dbo.users where active = 0 and last_login < dateadd(year, -2, getdate())
