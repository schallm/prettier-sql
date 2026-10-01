-- BACKUP / RESTORE forms the formatter doesn't model stay as written
backup database d file = 'f', filegroup = 'g' to disk = 'a' mirror to disk = 'c' with format

backup database d to disk = 'x' with encryption (algorithm = aes_256, server certificate = c)

restore database d filegroup = 'g' from disk = 'x' with partial

restore database d page = '1:57' from disk = 'x'

restore database d from database_snapshot = 's'

restore database d from disk = 'x' with stopatmark = 'm' after '2020-01-01'

restore database d from disk = 'x' with stopat = '2020-01-01'
