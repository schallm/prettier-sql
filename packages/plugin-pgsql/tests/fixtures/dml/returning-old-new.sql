-- PostgreSQL 18: RETURNING can read the row before and after the change
update accounts set balance = balance - 100 where id = 7 returning old.balance as before, new.balance as after;
insert into counters (name, hits) values ('home', 1) on conflict (name) do update set hits = counters.hits + 1 returning old.hits, new.hits;
delete from sessions where expires_at < now() returning old.*;

-- WITH (OLD AS o, NEW AS n) renames them, for a table that has columns called old or new
update price_history set old = 3, new = 4 where id = 1 returning with (old as o, new as n) o.old, o.new, n.old, n.new;
delete from audit returning with (old as prior) prior.id;
merge into stock s using deliveries d on s.item = d.item
when matched then update set qty = s.qty + d.qty
when not matched then insert (item, qty) values (d.item, d.qty)
returning with (old as was, new as now) merge_action(), was.qty, now.qty;
