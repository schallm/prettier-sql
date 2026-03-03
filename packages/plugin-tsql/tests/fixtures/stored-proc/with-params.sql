create procedure dbo.GetUserById @userId int, @includeInactive bit = 0 as begin select id, name, email, active from dbo.users where id = @userId and (active = 1 or @includeInactive = 1) end
