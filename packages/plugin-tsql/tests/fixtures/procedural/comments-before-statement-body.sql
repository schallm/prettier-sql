-- A line comment after the condition must end its line before the statement follows
if object_id('tempdb..#t') is not null drop table -- why
#t;
if @a = 1 print 'a' else if @a = 2 print -- two
'b' else print 'c';
go
create function dbo.f -- the name
(@a int) returns int as begin return @a end
go
create function dbo.g (@a int) returns int
as -- the body
begin return @a end
go
dbcc -- command
checkdb ('d') with no_infomsgs;
alter database d set automatic_index_compaction = -- value
on
create table dbo.c with (distribution = /* d */ hash(a), heap) as select 1 as a
