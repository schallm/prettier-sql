-- WITH RECURSIVE
with recursive org_tree as (select id, name, parent_id, 0 as depth from departments where parent_id is null union all select d.id, d.name, d.parent_id, t.depth + 1 from departments as d join org_tree as t on d.parent_id = t.id) select id, name, depth from org_tree order by depth, name;
