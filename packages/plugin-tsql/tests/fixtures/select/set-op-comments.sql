-- Two comments landing on the same node (one after each side of UNION ALL) must
-- print on separate lines, not run together as a single "-- a -- b" comment.
select 1 -- a
union all -- b
select 2 -- c
