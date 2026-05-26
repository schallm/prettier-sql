-- ALTER TABLE SWITCH PARTITION with WAIT_AT_LOW_PRIORITY options must be preserved

alter table dbo.SalesCurrent
switch partition 3 to dbo.SalesArchive partition 1
with (wait_at_low_priority (max_duration = 10 minutes, abort_after_wait = self))

alter table dbo.BigTable
switch partition 5 to dbo.BigTableArchive partition 1
with (wait_at_low_priority (max_duration = 0 minutes, abort_after_wait = none))

alter table dbo.BigTable
switch partition 5 to dbo.BigTableArchive partition 1
with (wait_at_low_priority (max_duration = 30 minutes, abort_after_wait = blockers))
