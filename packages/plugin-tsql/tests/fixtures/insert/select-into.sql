insert into archive_users (id, Name, Email, ArchivedAt) select id, Name, Email, getdate() from users where Active = 0 and LastLogin < dateadd(year, -2, getdate())
