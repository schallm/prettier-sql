-- BACKUP / RESTORE forms: FILE / FILEGROUP / PAGE lists, MIRROR TO, ENCRYPTION, DATABASE_SNAPSHOT, STOPATMARK
backup database d file = 'f', filegroup = 'g' to disk = 'a' mirror to disk = 'c' with format

backup database d to disk = 'x' with encryption (algorithm = aes_256, server certificate = c)

restore database d filegroup = 'g' from disk = 'x' with partial

restore database d page = '1:57' from disk = 'x'

restore database d from database_snapshot = 's'

restore database d from disk = 'x' with stopatmark = 'm' after '2020-01-01'

restore database d from disk = 'x' with stopat = '2020-01-01'

backup database d to disk = 'x' with expiredate = '2030-01-01', retaindays = 5, medianame = 'm', blocksize = 512

backup database d to Dev1, Dev2

restore database d from Dev1
