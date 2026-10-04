alter table dbo.Orders drop constraint PK_Orders with (online = on, move to [PRIMARY]);
alter table dbo.Orders drop constraint PK_Orders with (move to ps_orders(OrderDate), maxdop = 2);
