-- A function or method named with a reserved word keeps its brackets; VALUE is a method
select dbo.[key](1), x.[key](), t.c.[select](), $partition.[order](a), $partition.pf(a), x.value('.', 'int')
from t as x;

-- A ] inside a pivot column name is escaped
select *
from t
pivot (sum(a) for b in ([a]]b], [c])) as p;
