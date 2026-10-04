-- A window that builds on a named window keeps the name inside the parentheses
select x, rank() over (w2 rows unbounded preceding) from t window w2 as (order by b);
select x, sum(y) over (w order by c rows between 1 preceding and current row) from t window w as (partition by a);
select x, count(*) over (w partition by a) from t window w as (order by b);
select OrderId, sum(Amount) over (byCustomer order by OrderDate, OrderId rows between unbounded preceding and current row) as RunningTotal from Orders window byCustomer as (partition by CustomerId);
