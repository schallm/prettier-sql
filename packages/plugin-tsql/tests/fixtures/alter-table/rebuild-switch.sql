-- ALTER TABLE REBUILD / SWITCH, with and without a partition
alter table t rebuild with (online = on);
alter table t rebuild partition = all with (data_compression = page);
alter table t rebuild partition = 2;
alter table t rebuild partition = @p;
alter table t switch partition @p to t2 partition @p;
alter table t switch to t2;
