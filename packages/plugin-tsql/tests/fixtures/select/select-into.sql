-- SELECT INTO — the INTO target must appear between column list and FROM
select Id, Name, Email into #TempCustomers from Customers where IsActive = 1

select top (10) Id, Name into #TopCustomers from Customers order by Name

select Id, Name into dbo.Archive from Customers where IsActive = 0
