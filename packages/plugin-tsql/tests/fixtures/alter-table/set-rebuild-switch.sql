alter table Orders set (lock_escalation = auto)

alter table Orders set (lock_escalation = disable)

alter table Orders rebuild partition = all

alter table Orders rebuild partition = 3 with (data_compression = row)

alter table Orders switch partition 3 to ArchivedOrders partition 1

alter table Orders switch to ArchivedOrders
