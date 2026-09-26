-- DROP forms whose target is more than a name list

drop trigger if exists tr on s.t cascade;

drop policy p on t;

drop rule r on t;

drop operator class oc using btree;

drop operator family s.of using hash cascade;

drop cast (text as integer);

drop cast if exists (bigint as "char");

drop transform for hstore language plpython3u;

drop aggregate a(*), b(int);

drop type "char", mood, s.t;

drop domain d;

drop operator ===(int, int), @@(text, none);

drop table a, s.b;
