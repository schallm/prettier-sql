alter table t alter column a type text collate "C";
alter table t alter column a type text collate "C" using a::text;
alter type t alter attribute a type text collate "C";
