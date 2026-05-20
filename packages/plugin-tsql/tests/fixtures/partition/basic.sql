create partition function pf_OrderDate (datetime2)
as range right
for values ('2021-01-01', '2022-01-01', '2023-01-01', '2024-01-01')

create partition function pf_Price (decimal(10, 2))
as range left
for values (100, 500, 1000, 5000)

alter partition function pf_OrderDate()
split range ('2025-01-01')

alter partition function pf_OrderDate()
merge range ('2021-01-01')

drop partition function pf_Price

create partition scheme ps_OrderDate
as partition pf_OrderDate
to ([PRIMARY], fg2021, fg2022, fg2023, fg2024, fg2025)

create partition scheme ps_OrderDateArchive
as partition pf_OrderDate
all to ([PRIMARY])

alter partition scheme ps_OrderDate
next used fg2026

drop partition scheme ps_OrderDate
