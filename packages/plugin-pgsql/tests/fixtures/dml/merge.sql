-- Basic MERGE: WHEN MATCHED UPDATE, WHEN NOT MATCHED INSERT
merge into target as t
using source as s on t.id = s.id
when matched then update set
  name = s.name,
  updated_at = now()
when not matched then insert (id, name, created_at)
values (s.id, s.name, now());

-- MERGE with DO NOTHING and conditional
merge into inventory as inv
using incoming as inc on inv.product_id = inc.product_id
when matched and inc.quantity = 0 then
  delete
when matched then update set
  quantity = inv.quantity + inc.quantity
when not matched then insert (product_id, quantity)
values (inc.product_id, inc.quantity);

-- MERGE with WHEN NOT MATCHED BY SOURCE (PostgreSQL 15+)
merge into employees as e
using new_roster as nr on e.id = nr.id
when matched then update set
  name = nr.name
when not matched then insert (id, name)
values (nr.id, nr.name)
when not matched by source then
  delete;
