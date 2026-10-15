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

-- Each constraint keeps its own options
alter table dbo.Books drop constraint PK_Books with (online = off, move to Archive), UQ_Isbn with (maxdop = 4);
alter table dbo.Books drop column Notes, constraint PK_Old with (online = on), PK_Older with (move to Archive (Year), maxdop = 2);
