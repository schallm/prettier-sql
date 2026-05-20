select * from BigTable tablesample (10 percent)

select * from BigTable tablesample (1000 rows)

select * from BigTable tablesample system (10 percent) repeatable(42)

select Id, Name from dbo.Employee for system_time as of '2023-01-01'

select Id, Name from dbo.Employee for system_time from '2022-01-01' to '2023-01-01'

select Id, Name from dbo.Employee for system_time between '2022-01-01' and '2023-01-01'

select Id, Name from dbo.Employee for system_time contained in ('2022-01-01', '2023-01-01')

select Id, Name from dbo.Employee for system_time all
