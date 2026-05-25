-- COLLATE clause on column definition
create table dbo.Translations (
  Id int not null,
  Text nvarchar(max) collate SQL_Latin1_General_CP1_CI_AS,
  Code nvarchar(10) collate Latin1_General_BIN not null
)

-- SPARSE column
create table dbo.Props (
  Id int not null,
  StringProp nvarchar(100) sparse null,
  IntProp int sparse null
)

-- COLLATE + SPARSE together
create table dbo.SparseDocs (
  Id int not null,
  Title nvarchar(200) collate SQL_Latin1_General_CP1_CI_AS sparse null
)
