-- WITH options that carry values of their own
create table dbo.t (a int) with (distribution = hash(a), clustered columnstore index)

create table dbo.t (a int) with (distribution = replicate)

create table dbo.t (a int) with (heap)

create table dbo.t (a int) with (data_compression = page)

create table dbo.t (a int) with (ledger = on (ledger_view = dbo.v (transaction_id_column_name = x, sequence_number_column_name = y), append_only = on))

create table dbo.t (a int) with (ledger = on (append_only = on))

create table dbo.t (a int) with (remote_data_archive = on (migration_state = outbound))

create table dbo.t as filetable with (filetable_directory = 'd', filetable_collate_filename = database_default, filetable_primary_key_constraint_name = pk)

create table dbo.t (a int, b int) with (system_versioning = on (history_table = dbo.h, history_retention_period = 6 months))

create table dbo.t (a int) federated on (a = b)
