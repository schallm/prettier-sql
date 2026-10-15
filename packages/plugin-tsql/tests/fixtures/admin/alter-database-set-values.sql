-- ALTER DATABASE SET options keep their = and their names
alter database d set target_recovery_time = 60 seconds

alter database d set delayed_durability = forced

alter database d set partner = 'tcp://x:5022'

alter database d set filestream (non_transacted_access = full, directory_name = 'x')

alter database d set recovery simple with rollback immediate

alter database d set auto_close off, auto_shrink on

-- AUTO_CREATE_STATISTICS keeps INCREMENTAL
alter database Library set auto_create_statistics on (incremental = on), auto_update_statistics on;
alter database Library set auto_update_statistics on, auto_create_statistics on (incremental = off);

-- Bracketed names keep their case, even with an apostrophe inside
alter database Library set remote_data_archive = on (server = N'ArchiveServer', credential = [Archive's Credential]);
