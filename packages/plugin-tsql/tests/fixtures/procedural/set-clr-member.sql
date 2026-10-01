-- SET @var.member = value assigns a CLR type's property; SET @var.method(...) calls a method
declare @g geography
declare @p dbo.Point
declare @x xml

set @p.x = 1

set @p.x += 2

set @g.m()

set @x.modify('delete /a')

fetch c
