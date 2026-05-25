select j.[key], j.[value] from Orders as o cross apply openjson(o.JsonData) as j where o.id = 1;

select j.OrderId, j.amount from Orders as o cross apply openjson(o.JsonData, '$.items') with (OrderId int '$.id', amount decimal(10,2) '$.amount', notes nvarchar(500) '$.notes') as j;

select j.id, j.data from openjson(@json) with (id int '$.id', data nvarchar(max) '$.data' as json) as j;

select x.id, x.Name from openxml(@hDoc, '/root/item', 2) with (id int '@id', Name varchar(100) 'Name') as x;

select r.id, r.Name from openrowset('SQLNCLI', 'Server=(local);Trusted_Connection=yes;', 'select id, Name from pubs.titles') as r;

select * from openrowset(bulk 'C:\data\file.csv', formatfile='C:\data\fmt.xml', firstrow=2) as t;

select * from openrowset(bulk 'C:\data\data.json', single_blob) as j;

-- Built-in TVFs (BuiltInFunctionTableReference) — must normalize case
select [value] from STRING_SPLIT(@csv, ',')

select [value] from STRING_SPLIT(@csv, ',') as s

select * from GENERATE_SERIES(1, 100) as n

-- OPENQUERY
select * from OPENQUERY(RemoteServer, 'SELECT Id, Name FROM dbo.Customers')
