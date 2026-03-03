insert into dbo.archive_users (id, name, email, archived_at) select id, name, email, getdate() from dbo.users where active = 0 and last_login < dateadd(year, -2, getdate())
