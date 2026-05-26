alter table Books alter column Title nvarchar(500) null

alter table Books alter column Price decimal(12, 2) not null

alter table Books alter column Code varchar(20)

-- COLLATE clause must be preserved
alter table dbo.T alter column Name nvarchar(200) collate Latin1_General_CI_AS null

alter table dbo.T alter column Code varchar(20) collate SQL_Latin1_General_CP1_CS_AS not null
