create function dbo.GetUsersByDepartment (@departmentId int) returns table as return select id, name, email from dbo.users where department_id = @departmentId and active = 1
