-- DDL trigger: ON DATABASE scope must be preserved, DDL event names must not
-- become generic "EVENT" (ScriptDOM TriggerActionType maps all DDL events to same enum).

create trigger trgAuditDDL on database
for create_table, alter_table, drop_table
as
begin
    insert into dbo.DDLAudit (EventData, LoginName)
    values (eventdata(), original_login())
end
