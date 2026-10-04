-- A procedure on another server, reached through an ad hoc data source
exec opendatasource('MSOLEDBSQL', 'Data Source=Reporting;Integrated Security=SSPI').Sales.dbo.RefreshTotals

exec @rc = opendatasource('MSOLEDBSQL', 'Data Source=Reporting;Integrated Security=SSPI').Sales.dbo.GetOrders @CustomerId = 42, @Since = '2024-01-01'
