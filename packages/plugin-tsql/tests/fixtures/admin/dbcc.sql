-- DBCC statements — command names must not be garbled by enum mapping

dbcc checkdb ('MyDatabase') with no_infomsgs, all_errormsgs

-- CHECKCONSTRAINTS maps to enum Free(48) in ScriptDOM — must emit CHECKCONSTRAINTS not FREE
dbcc checkconstraints (Orders) with all_constraints, no_infomsgs

dbcc checktable (N'dbo.Orders') with all_errormsgs

dbcc shrinkfile (N'MyDatabase_log', 1)

dbcc freeproccache

dbcc dropcleanbuffers

dbcc show_statistics ('dbo.Orders', IX_Orders_CustId)
