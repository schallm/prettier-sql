with recursive
  t as (
    select id, parent_id from tree
    union all
    select tree.id, tree.parent_id from tree join t on t.id = tree.parent_id
  )
  search breadth first by id set ordercol
  cycle id set is_cycle using path
select * from t;

-- A cycle mark other than TRUE / FALSE
with recursive
  t as (
    select id, parent_id from tree
    union all
    select tree.id, tree.parent_id from tree join t on t.id = tree.parent_id
  )
  cycle id, parent_id set is_cycle to 'Y' default 'N' using path
select * from t;

-- TRUE / FALSE written out are the defaults
with recursive t as (select 1 as id) cycle id set is_cycle to true default false using path select * from t;
