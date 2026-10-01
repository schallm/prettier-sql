-- Hash indexes on memory-optimized tables
create table dbo.t (a int not null, b int, constraint pk primary key nonclustered hash (a) with (bucket_count = 1000)) with (memory_optimized = on)

create table dbo.t (a int not null primary key nonclustered hash with (bucket_count = 1000), b int) with (memory_optimized = on)

create table dbo.t (a int not null, constraint uq unique nonclustered hash (a) with (bucket_count = 64))
