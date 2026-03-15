create trigger BooksAfterInsert on Books after insert as
begin
    insert into AuditLog (TableName, Action, RecordId, ChangedAt)
    select 'Books', 'INSERT', Id, getdate()
    from inserted
end
