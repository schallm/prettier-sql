-- A cursor output parameter must be VARYING
create procedure dbo.OpenOrders @OrdersCursor cursor varying output, @Status varchar(10) = 'open'
as
open @OrdersCursor
