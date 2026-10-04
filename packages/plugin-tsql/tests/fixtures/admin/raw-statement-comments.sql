/* lead */ create external language l from (content = 'x', file_name = 'y', platform = windows) /* inside */;
backup database d to disk = 'x.bak' -- trailing
go
select 1
-- before semicolon
;
-- after semicolon
alter schema s transfer dbo.t
