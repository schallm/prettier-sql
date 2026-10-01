-- Bracketed names inside constraints, and user-defined types keep their schema and case
create table [t x] ([a b] int, [order] int, constraint [c d] foreign key ([a b]) references [u v] ([x y]), constraint [e f] primary key ([a b], [order]))

create table dbo.t (a dbo.MyType not null, b [my schema].[my type] null, c sysname)

create table dbo.t (a int references dbo.u ([x y]), b int constraint [fk 2] references dbo.v ([z w]))

create table dbo.t (a int constraint c1 check (a > 0) constraint c2 check (a < 10))

create table dbo.t (a int identity, b bigint identity(1000, 5))

alter table dbo.t add constraint [c d] foreign key ([a b]) references [u v] ([x y])

alter table dbo.t check constraint [c d]

alter table dbo.t alter column [a b] dbo.MyType not null

select cast(a as dbo.MyType), convert(dbo.MyType, a), try_cast(a as [my type]), try_convert(dbo.MyType, a)

create type dbo.t from [my type] not null

create type dbo.tt as table ([a b] int primary key, index [i x] ([a b]))
