-- BEGIN TRANSACTION WITH MARK must be preserved
begin transaction
go
begin transaction OrderTxn
go
begin transaction OrderTxn with mark
go
begin transaction OrderTxn with mark 'Creating order for customer'
go
commit transaction
go
rollback transaction SavePoint1
go
save transaction SavePoint1
go
begin distributed transaction
go
begin distributed transaction OrderTxn
