-- A trailing comment on a WHILE/IF condition stays right after the condition,
-- instead of being claimed (for the between-predicate case) and never printed.
while @x < 5 -- w
begin
  set @x += 1 -- inc
end

if exists (select 1 from t) -- e
begin
  return -- r
end
