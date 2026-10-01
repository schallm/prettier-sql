create table dbo.l (id int, s bigint generated always as transaction_id start hidden, e bigint generated always as transaction_id end hidden, q bigint generated always as sequence_number start hidden, w bigint generated always as sequence_number end hidden) with (ledger = on);
create table dbo.c (a int check not for replication (a > 0), b int constraint fk foreign key references dbo.u (id) not for replication, c int not null unique references dbo.u (id) check (c > 1), d int identity primary key not null);
alter table dbo.t with check check constraint c1, c2;
alter table dbo.t with nocheck check constraint all;
