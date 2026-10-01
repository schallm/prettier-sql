with a as ( -- the first one
    select 1 as x
), -- between the two
b as (
    select 2 as y -- inside b
)
select * from a, b;
