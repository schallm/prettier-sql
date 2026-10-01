create table [@@SCHEMA_NAME@@].[@@OBJECT_NAME@@] ([@col] int not null primary key);
select [@col] as [@alias] from [@@SCHEMA_NAME@@].[@@OBJECT_NAME@@];
