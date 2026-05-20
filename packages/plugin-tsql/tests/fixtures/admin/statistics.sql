create statistics stat1 on dbo.Orders (OrderDate)

create statistics stat2 on dbo.Orders (CustomerId, OrderDate) with fullscan

create statistics stat3 on dbo.Orders (Status) where Status = 'Active' with sample 50 percent, norecompute

update statistics dbo.Orders

update statistics dbo.Orders (stat1)

update statistics dbo.Orders with fullscan

update statistics dbo.Orders (stat1, stat2) with norecompute

drop statistics dbo.Orders.stat1

drop statistics dbo.Orders.stat1, dbo.Orders.stat2
