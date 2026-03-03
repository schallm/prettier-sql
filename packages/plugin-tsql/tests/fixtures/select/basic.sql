select u.id,u.name,u.email from dbo.users u inner join dbo.roles r on u.role_id=r.id where u.active=1 order by u.name asc
