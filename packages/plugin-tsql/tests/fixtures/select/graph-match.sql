-- Graph queries: MATCH predicate must not drop the MATCH( prefix

select p1.Name, p2.Name
from dbo.Person as p1, dbo.Knows as k, dbo.Person as p2
where match(p1-(k)->p2)

-- Directed edge in both directions
select p1.Name, p2.Name, k.Weight
from dbo.Person as p1, dbo.Knows as k, dbo.Person as p2
where match(p1-(k)->p2) or match(p2-(k)->p1)
