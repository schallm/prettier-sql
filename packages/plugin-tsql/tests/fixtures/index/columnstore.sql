create clustered columnstore index cci on dbo.Orders

create nonclustered columnstore index ncci on dbo.Orders (CustomerId, OrderDate, Total)

create nonclustered columnstore index ncci_filtered on dbo.Orders (CustomerId, OrderDate) where Status = 'Closed' with (drop_existing = on)
