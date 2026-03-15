backup database AdventureWorks to disk = N'C:\Backups\AW_Full.bak' with noformat, init, name = N'AdventureWorks Full Backup', stats = 10

backup database AdventureWorks to disk = N'C:\Backups\AW_Full_1.bak', disk = N'C:\Backups\AW_Full_2.bak' with compression, checksum

backup log AdventureWorks to disk = N'C:\Backups\AW_Log.bak' with norecovery

restore database AdventureWorks from disk = N'C:\Backups\AW_Full.bak' with norecovery

restore database AdventureWorks from disk = N'C:\Backups\AW_Full.bak' with move N'AW_Data' to N'C:\Data\AW.mdf', move N'AW_Log' to N'C:\Data\AW.ldf', recovery, stats = 5

restore log AdventureWorks from disk = N'C:\Backups\AW_Log.bak' with recovery

restore filelistonly from disk = N'C:\Backups\AW_Full.bak'

restore headeronly from disk = N'C:\Backups\AW_Full.bak'

restore verifyonly from disk = N'C:\Backups\AW_Full.bak'

drop database AdventureWorks

drop database if exists AdventureWorks

drop database AdventureWorks, AdventureWorksDev
