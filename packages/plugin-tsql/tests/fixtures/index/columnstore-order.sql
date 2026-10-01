-- CREATE CLUSTERED COLUMNSTORE INDEX ... ORDER (...)
create clustered columnstore index cci on dbo.t order (a, b)

create clustered columnstore index cci on dbo.t order (a) with (drop_existing = on)
