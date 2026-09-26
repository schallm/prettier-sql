-- SELECT ... INTO a new table on a filegroup
select a, b into dbo.newt on [PRIMARY] from t;
select a into #t on fg2 from t where a > 0;
