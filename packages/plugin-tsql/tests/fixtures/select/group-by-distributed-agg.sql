-- WITH (DISTRIBUTED_AGG) on a grouping column (Azure Synapse)
select CustomerId, sum(Amount) from dbo.Sales group by CustomerId with (distributed_agg)

select Region, CustomerId, sum(Amount) from dbo.Sales group by Region, CustomerId with (distributed_agg)

select Region, sum(Amount) from dbo.Sales group by rollup(Region with (distributed_agg))
