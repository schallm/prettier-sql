-- ONLY excludes inheritance children and partitions: dropping it changes the rows affected
select * from only measurements;
update only measurements set flagged = true;
delete from only measurements where taken_at < '2020-01-01';
truncate only measurements;
lock table only measurements;
