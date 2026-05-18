select region, product, grouping(region, product) as grp, sum(amount) from sales group by grouping sets ((region, product), (region), ());
