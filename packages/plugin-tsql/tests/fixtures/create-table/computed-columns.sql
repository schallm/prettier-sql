create table OrderItems (
  Id int not null identity(1, 1),
  Quantity int not null,
  UnitPrice decimal(10, 2) not null,
  LineTotal as Quantity * UnitPrice,
  constraint PK_OrderItems primary key (Id)
)

create table Products (
  Id int not null identity(1, 1),
  Name nvarchar(200) not null,
  Price decimal(10, 2) not null,
  PriceWithTax as Price * 1.1 persisted,
  constraint PK_Products primary key (Id)
)

-- PERSISTED NOT NULL must not drop the NOT NULL constraint
create table dbo.Employees (
  Id int not null primary key,
  FirstName nvarchar(50) not null,
  LastName nvarchar(50) not null,
  FullName as (FirstName + ' ' + LastName) persisted not null
)
