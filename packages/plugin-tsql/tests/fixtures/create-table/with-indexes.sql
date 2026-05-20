create table Products (
  Id int not null identity(1, 1),
  Sku nvarchar(50) not null,
  Name nvarchar(200) not null,
  Price decimal(10, 2) not null,
  constraint PK_Products primary key (Id),
  constraint UQ_Products_Sku unique (Sku),
  index IX_Products_Name nonclustered (Name)
)

create table OrderItems (
  Id int not null identity(1, 1),
  OrderId int not null,
  ProductId int not null,
  Quantity int not null default 1,
  constraint PK_OrderItems primary key (Id),
  constraint FK_OrderItems_Orders foreign key (OrderId) references Orders (Id),
  constraint FK_OrderItems_Products foreign key (ProductId) references Products (Id),
  index IX_OrderItems_OrderId nonclustered (OrderId),
  index IX_OrderItems_ProductId nonclustered (ProductId)
)
