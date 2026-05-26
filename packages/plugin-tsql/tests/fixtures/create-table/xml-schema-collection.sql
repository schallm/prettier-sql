-- XML typed columns: schema collection must be preserved

create table dbo.Orders (
    OrderId int not null primary key,
    OrderXml xml(dbo.OrderSchema) not null
)

-- CONTENT/DOCUMENT options must also be preserved
create table dbo.Documents (
    Id int not null primary key,
    Content xml(content dbo.DocSchema) null,
    Doc xml(document dbo.StrictSchema) null,
    Untyped xml null
)
