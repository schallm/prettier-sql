begin transaction

begin transaction SaveOrder

save transaction BeforeSave

rollback transaction

rollback transaction BeforeSave

commit transaction

commit transaction SaveOrder

begin try
  begin transaction
  insert into Orders (CustomerId, Total) values (1, 99.99)
  commit transaction
end try
begin catch
  rollback transaction
  throw
end catch

set transaction isolation level read committed

set transaction isolation level serializable

set transaction isolation level snapshot
