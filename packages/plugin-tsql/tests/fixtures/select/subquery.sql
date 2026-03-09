select id, Name from users where id in (select UserId from orders where Total > 1000) and DepartmentId = (select id from departments where Name = 'Engineering')
