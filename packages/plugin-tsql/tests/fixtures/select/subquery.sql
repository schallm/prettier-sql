select id, name from dbo.users where id in (select user_id from dbo.orders where total > 1000) and department_id = (select id from dbo.departments where name = 'Engineering')
