create procedure GetActiveUsers as begin select id, Name, Email from users where Active = 1 order by Name asc end
