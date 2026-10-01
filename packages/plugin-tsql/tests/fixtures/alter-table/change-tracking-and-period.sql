-- ENABLE / DISABLE CHANGE_TRACKING, DROP PERIOD, and the rarer forms kept as written
alter table dbo.t enable change_tracking

alter table dbo.t enable change_tracking with (track_columns_updated = on)

alter table dbo.t enable change_tracking with (track_columns_updated = off)

alter table dbo.t disable change_tracking

alter table dbo.t drop period for system_time

alter table dbo.t drop constraint c, column d, period for system_time

alter table dbo.t enable filetable_namespace

alter table dbo.t disable filetable_namespace

alter table dbo.t split range (1)

alter table dbo.t merge range (1)
