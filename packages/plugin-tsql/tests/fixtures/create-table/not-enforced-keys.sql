-- Informational keys that the engine doesn't enforce (Azure Synapse, Fabric)
create table dbo.Sales (SaleId int not null, CustomerId int not null references dbo.Customers (CustomerId) not enforced, StoreId int not null primary key nonclustered not enforced, constraint uq_Sales unique (SaleId) not enforced, constraint fk_Sales_Product foreign key (SaleId) references dbo.Products (ProductId) on delete cascade not enforced);
go
alter table dbo.Sales add constraint pk_Sales primary key nonclustered (SaleId) not enforced;
