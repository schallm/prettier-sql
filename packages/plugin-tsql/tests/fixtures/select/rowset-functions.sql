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

-- OPENROWSET ... WITH (columns): the columns to read, by ordinal or JSON path
select * from openrowset(bulk 'https://acct.blob.core.windows.net/data/sales.csv', format = 'csv', parser_version = '2.0', firstrow = 2) with (SaleId int 1, Region varchar(20) collate Latin1_General_100_BIN2_UTF8 2, Amount decimal(10, 2) 3) as s;

select * from openrowset(bulk 'https://acct.blob.core.windows.net/data/events.parquet', format = 'parquet') with (EventId int '$.id', Kind nvarchar(50) '$.kind') as e;

select * from openrowset('MSOLEDBSQL', 'Server=Reporting;Trusted_Connection=yes', 'select Id, Name from dbo.Customers') with (Id int, Name nvarchar(100)) as c;
