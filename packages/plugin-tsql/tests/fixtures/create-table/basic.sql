create table Books (Id int not null identity(1,1), Title nvarchar(200) not null, Price decimal(10,2) not null, InStock bit not null default 1, PublishedDate datetime2 not null default getdate(), constraint PK_Books primary key (Id))

-- IDENTITY with signed or decimal seed and increment
create table Counters (Up int identity(+100000, 2), Down int identity(-1, -1), Dec numeric(10, 0) identity(1., 1.));
