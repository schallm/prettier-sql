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

-- An edge table without columns, and indexes on graph pseudo-columns
create table dbo.Likes as edge

create table dbo.Book (
    Id int not null,
    Title nvarchar(200) not null,
    index IX_Book_Node unique nonclustered ($node_id),
    index IX_Book_Title (Title) include ($node_id)
) as node

create index IX_Likes_Ends on dbo.Likes ($from_id, $to_id)
