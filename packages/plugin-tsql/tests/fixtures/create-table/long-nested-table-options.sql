create table dbo.t (id int not null) with (system_versioning = on (history_table = dbo.SomeLongHistoryTableName, history_retention_period = 6 months));
create table dbo.t2 (id int not null) with (ledger = on (ledger_view = dbo.SomeLongLedgerViewName (transaction_id_column_name = ledger_transaction_id, sequence_number_column_name = ledger_sequence_number), append_only = on));
create table dbo.t3 (id int not null) with (system_versioning = on (history_table = dbo.h), memory_optimized = on, durability = schema_only);
alter table dbo.t set (system_versioning = on (history_table = dbo.SomeLongHistoryTableName, history_retention_period = 6 months, data_consistency_check = on));
alter table dbo.t set (remote_data_archive = on (filter_predicate = dbo.some_long_filter_function_name(a), migration_state = outbound));
alter table dbo.t set (lock_escalation = table);
alter table dbo.t set (system_versioning = on (history_table = dbo.h));
