-- DROP INDEX: WITH options, and the old table.index form
DROP INDEX ix ON t WITH (ONLINE = ON);

DROP INDEX IF EXISTS ix ON dbo.t WITH (MAXDOP = 2, ONLINE = OFF, MOVE TO fg2);

DROP INDEX t.ix1, dbo.t.ix2;

DROP INDEX ix1 ON t1, ix2 ON t2;
