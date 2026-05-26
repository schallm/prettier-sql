-- Inline column-level FK with constraint name and FOREIGN KEY keywords must be preserved

create table dbo.LineItems (
    LineId int not null identity(1, 1) constraint PK_LineItems primary key,
    OrderId int not null constraint FK_LineItems_Order foreign key references dbo.Orders (OrderId) on delete cascade,
    ProductId int not null constraint FK_LineItems_Product references dbo.Products (ProductId),
    Quantity int not null constraint CHK_Qty check (Quantity > 0),
    UnitPrice decimal(10, 2) not null,
    constraint UQ_LineItems_OrderProduct unique (OrderId, ProductId)
)
