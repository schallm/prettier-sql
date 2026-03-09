update u set u.RoleName = r.Name, u.UpdatedAt = getdate() from users u inner join roles r on u.RoleId = r.id where r.IsAdmin = 1
