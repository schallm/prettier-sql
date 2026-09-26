-- Bracketed reserved words keep their brackets in every position
select [t].[order] as [select], [from] = 1 from [dbo].[table] as [t] join [user] as [u] on [t].[key] = [u].[key];
with [group] ([order]) as (select 1) select [order] from [group];
create table [dbo].[order] ([key] int constraint [primary] primary key, [select] int constraint [default] default 0, [check] as ([key] + 1), index [index] ([select]));
create index [index] on [order] ([select] desc) include ([from]);
alter table [order] add [column] int;
alter table [order] alter column [select] bigint;
alter table [order] drop constraint [primary];
alter table [order] drop column [column];
insert into [order] ([key], [select]) values (1, 2);
update [order] set [select] = 1 where [key] = 2;
delete from [order] where [key] = 1;
declare [cursor] cursor for select 1; open [cursor]; fetch next from [cursor]; close [cursor]; deallocate [cursor];
go
create view [view] as select [key] from [order];
go
create procedure [proc] @a int as select @a;
go
exec [proc] 1;

-- CLR / xml methods are case-sensitive and user functions keep their names: only built-ins get keyword casing
select h.GetAncestor(1), g.STDistance(@p), h.ToString(), hierarchyid::GetRoot(), geography::Point(1,2,4326), x.value('.', 'int'), dbo.MyFunc(1), MyFunc2(2) from t
select dbo.[My Fn](1), dbo.[order]() from t;
create index ix on t (a) on [primary];
