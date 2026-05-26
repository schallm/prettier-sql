-- Natively compiled stored procedures — BEGIN ATOMIC WITH (...) must be preserved

create procedure dbo.usp_GetOrder
    @Id int
with native_compilation, schemabinding, execute as owner
as begin atomic with (transaction isolation level = snapshot, language = N'English')
    select Id, CustId, Amount
    from dbo.Orders
    where Id = @Id
end
