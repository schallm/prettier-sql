if exists (select 1 from sys.objects where object_id = object_id(N'[dbo].[Orders]') and type in (N'U')) drop table dbo.Orders;
if @a = 1 print 'short';
