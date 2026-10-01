/* lead */ create database d containment = partial /* inside */;
backup database d to disk = 'x.bak' -- trailing
go
select 1
-- before semicolon
;
-- after semicolon
alter schema s transfer dbo.t
