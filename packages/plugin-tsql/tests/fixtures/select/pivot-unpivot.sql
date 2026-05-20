select *
from Sales
pivot (
  sum(Amount) for Quarter in ([Q1], [Q2], [Q3], [Q4])
) as PivotTable

select CustomerId, [2022], [2023], [2024]
from (
  select CustomerId, year(OrderDate) as OrderYear, Total
  from Orders
) as src
pivot (
  sum(Total) for OrderYear in ([2022], [2023], [2024])
) as YearlyTotals

select *
from PivotedSales
unpivot (
  Amount for Quarter in (Q1, Q2, Q3, Q4)
) as UnpivotTable
