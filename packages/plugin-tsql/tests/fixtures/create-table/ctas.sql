-- CREATE TABLE AS SELECT (Synapse / Fabric): the SELECT and WITH options are part of the table
create table dbo.t as select 1 as a

create table dbo.t with (distribution = round_robin) as select 1 as a

create table dbo.t with (distribution = hash(a, b), clustered columnstore index) as select a, b from dbo.u

create table dbo.t (x, y) with (distribution = replicate, heap) as select a, b from dbo.u where a > 1

create table dbo.t with (distribution = hash(a), clustered index (a desc, b)) as select a, b from dbo.u

create table dbo.t with (distribution = round_robin, clustered columnstore index order (a, b)) as select a, b from dbo.u
