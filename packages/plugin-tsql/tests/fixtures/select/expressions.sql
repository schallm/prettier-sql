select next value for dbo.OrderSeq

select next value for dbo.OrderSeq over (order by Id)

select parse('2023-01-01' as date)

select parse('3.14' as decimal(10, 2) using 'en-US')

select try_parse('abc' as int)

select try_parse('2023-01-01' as date using 'en-US')

select string_agg(Name, ', ') within group (order by Name)
from Authors

select percentile_cont(0.5) within group (order by Salary)
over (partition by Department)
from Employees

select top (10) with ties Id, Title, Price
from Books
order by Price desc

select top (10) percent Id, Title
from Books
order by Price desc
