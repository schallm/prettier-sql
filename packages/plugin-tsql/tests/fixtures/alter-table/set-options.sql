-- ALTER TABLE SET (...) options keep their names
alter table dbo.t set (filestream_on = fs)

alter table dbo.t set (lock_escalation = auto, filestream_on = fs)

alter table dbo.t set (system_versioning = on (history_table = dbo.h, history_retention_period = 6 months))

alter table dbo.t set (system_versioning = on (history_retention_period = infinite))

alter table dbo.t set (system_versioning = off)

alter table dbo.t set (remote_data_archive = on (filter_predicate = dbo.fn(a), migration_state = outbound))

alter table dbo.t set (filetable_directory = 'x')
