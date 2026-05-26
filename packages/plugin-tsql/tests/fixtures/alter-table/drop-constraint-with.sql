-- DROP CLUSTERED CONSTRAINT WITH options (ONLINE, WAIT_AT_LOW_PRIORITY, MAXDOP) must be preserved

alter table dbo.Orders
drop constraint PK_Orders
with (online = on, wait_at_low_priority (max_duration = 5 minutes, abort_after_wait = self))

alter table dbo.Orders
drop constraint IX_Orders_Date
with (online = on, wait_at_low_priority (max_duration = 10 minutes, abort_after_wait = blockers))

alter table dbo.BigTable
drop constraint CL_BigTable
with (online = on, maxdop = 4)
