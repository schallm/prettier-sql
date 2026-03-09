delete from users where Active = 0 and LastLogin < dateadd(year, -2, getdate())
