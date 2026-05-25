-- WITH CHECK OPTION prevents inserts/updates that would hide the row from the view
create view dbo.ActiveOrders with schemabinding as
select Id, CustomerId, Total from dbo.Orders where Status < 5
with check option
