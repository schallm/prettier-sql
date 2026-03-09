create procedure GetUserById @userId int, @includeInactive bit = 0 as begin select id, Name, Email, Active from users where id = @userId and (Active = 1 or @includeInactive = 1) end
