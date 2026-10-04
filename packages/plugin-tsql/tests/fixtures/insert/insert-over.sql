-- INSERT and INSERT INTO are the same statement; INSERT OVER is another
insert dbo.Orders (OrderId) values (1)

insert top (10) dbo.Orders (OrderId) select OrderId from dbo.Staging

insert over dbo.Orders (OrderId) values (1)

insert top (10) over dbo.Orders (OrderId) select OrderId from dbo.Staging
