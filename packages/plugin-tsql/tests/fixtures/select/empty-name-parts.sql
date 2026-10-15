-- An empty part in the middle is kept: db..t1 is t1 in db's default schema
select * from Library..Books;
select * from LinkedSrv.Library..Books;
select * from LinkedSrv..dbo.Books;
select * from LinkedSrv...Books;

-- A leading empty part is the current server or database, as leaving it off is
select * from ..dbo.Books;
select * from .Library..Books;
create table .Sales.Orders (OrderId int);
