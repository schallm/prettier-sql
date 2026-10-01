-- A parameter's NULL / NOT NULL
create procedure dbo.p @a int null, @b int not null
as
select 1
