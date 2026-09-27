-- Idempotence: once ASC is spelled out, ORDER BY's own trailing comment moves
-- from the sort expression to the ORDER BY element itself.
select a
from t
order by a -- ord
offset 1 rows -- off
