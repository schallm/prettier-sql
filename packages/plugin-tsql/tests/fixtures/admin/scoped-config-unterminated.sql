alter database scoped configuration set maxdop = 4 -- cores
select 1
go
if 1 = 1
begin
  alter database scoped configuration set legacy_cardinality_estimation = on
end
alter database scoped configuration clear procedure_cache
alter database scoped configuration for secondary set maxdop = primary
