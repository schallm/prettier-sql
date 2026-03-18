backup database Bookstore to disk = N'C:\Backups\Bookstore_Full.bak' with noformat, init, name = N'Bookstore Full Backup', stats = 10

backup database Bookstore to disk = N'C:\Backups\Bookstore_Full_1.bak', disk = N'C:\Backups\Bookstore_Full_2.bak' with compression, checksum

backup log Bookstore to disk = N'C:\Backups\Bookstore_Log.bak' with norecovery

restore database Bookstore from disk = N'C:\Backups\Bookstore_Full.bak' with norecovery

restore database Bookstore from disk = N'C:\Backups\Bookstore_Full.bak' with move N'Bookstore_Data' to N'C:\Data\Bookstore.mdf', move N'Bookstore_Log' to N'C:\Data\Bookstore.ldf', recovery, stats = 5

restore log Bookstore from disk = N'C:\Backups\Bookstore_Log.bak' with recovery

restore filelistonly from disk = N'C:\Backups\Bookstore_Full.bak'

restore headeronly from disk = N'C:\Backups\Bookstore_Full.bak'

restore verifyonly from disk = N'C:\Backups\Bookstore_Full.bak'

drop database Bookstore

drop database if exists Bookstore

drop database Bookstore, BookstoreDev
