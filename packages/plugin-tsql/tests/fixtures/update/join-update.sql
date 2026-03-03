update u set u.role_name = r.name, u.updated_at = getdate() from dbo.users u inner join dbo.roles r on u.role_id = r.id where r.is_admin = 1
