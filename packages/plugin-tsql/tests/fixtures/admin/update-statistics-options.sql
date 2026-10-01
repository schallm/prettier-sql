-- Every UPDATE STATISTICS option keeps its keyword
update statistics dbo.t with stats_stream = 0x01

update statistics dbo.t with fullscan

update statistics dbo.t with resample

update statistics dbo.t with sample 10 percent

update statistics dbo.t with sample 1000 rows

update statistics dbo.t with fullscan, norecompute

update statistics dbo.t with incremental = on

update statistics dbo.t with persist_sample_percent = on

update statistics dbo.t with rowcount = 10, pagecount = 5

update statistics dbo.t with all

update statistics dbo.t with columns

update statistics dbo.t with index

update statistics dbo.t s with fullscan, all

update statistics dbo.t (s1, s2) with fullscan
