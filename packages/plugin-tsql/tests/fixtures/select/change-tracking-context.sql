-- WITH CHANGE_TRACKING_CONTEXT must be preserved as prefix before DML

with change_tracking_context (@ctx)
update dbo.T set Name = 'Updated' where Id = 1

with change_tracking_context (@ctx)
insert into dbo.T (Name) values ('New Row')

with change_tracking_context (@ctx)
delete from dbo.T where Id = 42
