alter database SalesDB set automatic_index_compaction = on

alter database SalesDB set automatic_index_compaction = off

-- An availability group name keeps its case
alter database MyDb set hadr availability group = MyAg;
