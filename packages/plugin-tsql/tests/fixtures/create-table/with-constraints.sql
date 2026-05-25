create table Orders (Id int not null identity(1,1), CustomerId int not null, Total decimal(18,2) not null, Status nvarchar(50) not null default 'pending', OrderDate datetime2 not null default getdate(), constraint PK_Orders primary key (Id), constraint FK_Orders_Customers foreign key (CustomerId) references Customers (Id), constraint CK_Orders_Total check (Total >= 0))

-- inline column-level CHECK (previously silently dropped)
create table Products (Id int not null, Status tinyint not null check (Status in (0,1,2)), Rating decimal(3,1) check (Rating between 0 and 10), constraint PK_Products primary key (Id))

-- CLUSTERED/NONCLUSTERED and DESC column sort order must be preserved
create table Events (Id bigint not null, OccurredAt datetime2 not null, EventType tinyint not null, constraint PK_Events primary key clustered (Id asc, OccurredAt desc), constraint UQ_Events unique nonclustered (EventType asc, Id asc))