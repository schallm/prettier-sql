-- ALTER COLUMN keeps NOT FOR REPLICATION, its column properties and its WITH options
alter table dbo.t alter column a drop not for replication

alter table dbo.t alter column a add not for replication

alter table dbo.t alter column a varchar(max) with (online = on)

alter table dbo.t alter column a int sparse

alter table dbo.t alter column a int hidden

alter table dbo.t alter column a int masked with (function = 'default()')

alter table dbo.t alter column a int encrypted with (column_encryption_key = k, encryption_type = deterministic, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_256')

alter table dbo.t alter column a varchar(10) collate latin1_general_bin not null

-- ADD / DROP keep their WITH (ONLINE = ...)
alter table dbo.Books alter column Guid add rowguidcol with (online = on);
alter table dbo.Books alter column Guid drop rowguidcol with (online = off);
alter table dbo.Books alter column BookId add not for replication with (online = on);
