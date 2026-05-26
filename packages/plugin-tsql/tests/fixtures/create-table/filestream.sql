-- FILESTREAM_ON clause must be preserved

create table dbo.Documents (
    Id int not null primary key,
    DocStream varbinary(max) filestream null,
    RowGuid uniqueidentifier not null rowguidcol unique default newid()
) on DataFileGroup filestream_on FileStreamGroup
