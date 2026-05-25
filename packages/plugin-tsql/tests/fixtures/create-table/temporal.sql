-- Temporal (system-versioned) table features

-- GENERATED ALWAYS AS ROW START/END + PERIOD FOR SYSTEM_TIME + SYSTEM_VERSIONING
create table Orders (
    Id int not null,
    Status tinyint not null,
    ValidFrom datetime2 generated always as row start not null,
    ValidTo datetime2 generated always as row end not null,
    period for system_time (ValidFrom, ValidTo),
    constraint PK_Orders primary key (Id)
) with (system_versioning = on)

-- GENERATED ALWAYS with HIDDEN
create table dbo.Customers (
    Id int not null,
    Name nvarchar(100) not null,
    ValidFrom datetime2 generated always as row start hidden not null,
    ValidTo datetime2 generated always as row end hidden not null,
    period for system_time (ValidFrom, ValidTo)
)

-- Dynamic data masking
create table Employees (
    Id int not null,
    Name nvarchar(100) not null,
    Email nvarchar(200) masked with (function = 'email()') not null,
    Phone varchar(20) masked with (function = 'default()') null
)
