-- ADD prints as ADD COLUMN, which T-SQL doesn't accept
alter table books add summary varchar(500);

alter table books add is_featured integer not null default 0;
