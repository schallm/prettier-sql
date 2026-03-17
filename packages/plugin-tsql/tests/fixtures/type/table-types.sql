create type dbo.IdList as table (Id int not null primary key)

create type dbo.NameValuePair as table (
  Name nvarchar(100) not null,
  Value nvarchar(500) null
)

create type dbo.OrderLine as table (
  LineId int not null primary key,
  ProductId int not null,
  Quantity int not null default 1,
  UnitPrice decimal(10, 2) not null
)

drop type dbo.IdList

drop type if exists dbo.NameValuePair
