-- Graph table types — AS NODE and AS EDGE must be preserved

create table dbo.Person (
    Id int not null primary key,
    Name nvarchar(100) not null
) as node

create table dbo.Company (
    Id int not null primary key,
    Name nvarchar(200) not null,
    Industry nvarchar(100) null
) as node

create table dbo.WorksAt (
    StartDate date null,
    Title nvarchar(100) null
) as edge

create table dbo.Knows (
    Weight float null
) as edge
