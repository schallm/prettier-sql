create table dbo.Transactions (
  Id int primary key,
  Amount decimal(18, 2) not null,
  UserId int not null
)
with (system_versioning = on, ledger = on);

create table dbo.NonLedger (
  Id int primary key,
  Name nvarchar(200) not null
)
with (ledger = off);
