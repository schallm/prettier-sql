create table t of typ (a with options not null);
create table t of typ;
create table t of typ (a with options default 1, constraint c check (a > 0));
create table t (a int storage plain compression pglz);
create table t (a int storage external);
create table t (a text compression lz4 collate "C" not null);
create unlogged table t of typ (primary key (a));
create foreign table ft (a int storage plain) server s;
create foreign table if not exists ft (a int) server s;
