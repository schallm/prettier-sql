-- Stored proc with table-valued parameter (UDT type must not be keyword-cased)
create procedure dbo.BulkInsertOrders
  @Items dbo.OrderList readonly,
  @UserId int
as
begin
  insert into dbo.Orders (CustomerId, Total)
  select CustomerId, Total
  from @Items;
end
