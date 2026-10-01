-- An xml schema collection and a user-defined type keep their case wherever a type is written
alter table dbo.t alter column a xml(content dbo.Sc)

go

create procedure dbo.p @x xml(dbo.Sc), @y varchar(max), @z decimal(10, 2)
as
select 1

go

declare @x xml(document dbo.Sc)

declare @y xml(dbo.Sc), @z varchar(max)

select cast(a as xml(dbo.Sc)), convert(xml(dbo.Sc), a)

go

create function dbo.f (@x xml(dbo.Sc))
returns xml(dbo.Sc)
as
begin
  return null
end

go

create function dbo.g ()
returns dbo.MyType
as
begin
  return null
end
