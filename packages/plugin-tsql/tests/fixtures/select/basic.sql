select u.id,u.Name,u.Email from users u inner join roles r on u.RoleId=r.id where u.Active=1 order by u.Name asc
