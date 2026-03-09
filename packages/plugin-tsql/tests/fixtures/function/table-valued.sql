create function GetUsersByDepartment (@departmentId int) returns table as return select id, Name, Email from users where DepartmentId = @departmentId and Active = 1
