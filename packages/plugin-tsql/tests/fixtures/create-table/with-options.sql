create table ArchivedOrders (
  Id int not null,
  CustomerId int not null,
  Total decimal(18, 2) not null,
  constraint PK_ArchivedOrders primary key (Id)
) with (data_compression = page)

create table BigData (
  Id int not null,
  Payload nvarchar(max) null,
  constraint PK_BigData primary key (Id)
) with (data_compression = row, memory_optimized = off)
