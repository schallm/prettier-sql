-- Every part of a qualified name is kept
select dbo.Point::Parse('1,2'), Shape::Unit();
select [dbo].[type]::func().func2(@a.f());
select * from Sales pivot (dbo.Stats.WeightedAvg(Price, Sales.Quantity) for Region in ([East], [West])) as p;
select * from Sales pivot (sum(Sales.Amount) for Region in ([East], [West])) as p;
enable trigger Library.dbo.trgAudit, dbo.trgLog on dbo.Books;
disable trigger Library.dbo.trgAudit on database;
