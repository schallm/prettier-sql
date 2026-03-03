create procedure dbo.GetActiveUsers as begin select id, name, email from dbo.users where active = 1 order by name asc end
