create type dbo.BookTitle from nvarchar(200) not null

create type dbo.Price from decimal(10, 2) null

create type dbo.BookTableType as table (
    Id int not null,
    Title nvarchar(200) not null,
    Price decimal(10, 2) not null,
    InStock bit not null
)

create type dbo.OrderLineType as table (
    LineId int not null,
    BookId int not null,
    Quantity int not null,
    UnitPrice decimal(10, 2) not null
)
