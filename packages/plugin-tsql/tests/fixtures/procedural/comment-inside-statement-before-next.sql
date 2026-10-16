alter table dbo.t /* inside */ add c int null, constraint df default 0 for c;
select * into #tmp from /* here */ t;
exec dbo.p @a /* arg */ = 1;
drop table if exists #tmp;
