with recursive
  t as (
    select id, parent_id from tree
    union all
    select tree.id, tree.parent_id from tree join t on t.id = tree.parent_id
  )
  search breadth first by id set ordercol
  cycle id set is_cycle using path
select * from t;
