-- Azure Synapse materialized views
create materialized view dbo.SalesByRegion with (distribution = hash(Region, Year), for_append) as select Region, Year, max(Amount) as MaxAmount, count_big(*) as Orders from dbo.Sales group by Region, Year;
go
create materialized view dbo.SalesByYear with (for_append, distribution = round_robin) as select Year, sum(Amount) as Total, count_big(*) as Orders from dbo.Sales group by Year;
go
alter materialized view dbo.SalesByRegion rebuild;
go
alter materialized view dbo.SalesByRegion disable;
go

-- An ordinary view's attributes take no parentheses
create view dbo.Recent with schemabinding, view_metadata as select Id from dbo.Sales;
