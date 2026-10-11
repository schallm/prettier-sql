-- RESTART without a value, and CACHE without a size
alter sequence dbo.s restart

alter sequence dbo.s restart with 5

alter sequence dbo.s cache

alter sequence dbo.s no cache

-- A user-defined type keeps its case
create sequence MySeq as dbo.MyInt;
