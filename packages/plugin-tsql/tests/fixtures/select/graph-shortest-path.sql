-- SHORTEST_PATH: the tables it walks are marked FOR PATH, and aggregates over the path use WITHIN GROUP (GRAPH PATH)
select p1.Name, string_agg(p2.Name, '->') within group (graph path) as Friends, last_value(p2.Name) within group (graph path) as LastFriend, count(p2.Name) within group (graph path) as Levels
from Person as p1, FriendOf for path as fo, Person for path as p2
where match(shortest_path(p1(-(fo)->p2)+)) and p1.Name = 'Alice'

select p1.Name, string_agg(p2.Name, '->') within group (graph path)
from Person p1, FriendOf for path fo, Person for path p2
where match(shortest_path(p1(-(fo)->p2){1,3}))

select f.Name from (select Name from Person) for path as f

select v.a from (values (1), (2)) for path as v (a)
