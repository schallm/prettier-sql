-- A trailing comment on a WHEN MATCHED/NOT MATCHED predicate stays right after the
-- predicate, on its own line, and doesn't swallow the THEN that follows it.
merge t as target
using s as source
on target.id = source.id
when matched and target.a = 1 -- m
then delete
when not matched and source.a = 2 -- nm
then insert (a) values (source.a);
