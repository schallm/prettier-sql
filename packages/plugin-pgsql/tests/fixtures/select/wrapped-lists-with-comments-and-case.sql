select coalesce(a.very_long_column_name_one, -- first choice
  a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_four) as c from t a;
select coalesce(case when a.x = 1 then 1 end, a.very_long_column_name_two, a.very_long_column_name_three, a.f) as c from t a;
select f((select max(id) from u), a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_four) as c from t a;
select a.id from t a where a.status in ('pending', 'shipped', -- the open states
  'cancelled', 'returned', 'refunded', 'on_hold', 'archived', 'deleted');
select a.id from t a where a.status in (a.very_long_column_name_one, case when a.x = 1 then 2 end, a.very_long_column_name_two);
select a.id, sum(case when a.x = 1 then a.very_long_column_name_one else a.very_long_column_name_two end) as total from t a group by a.id;
select a.base_amount + a.shipping_amount * a.tax_rate - a.discount_amount -- adjusted
  + a.handling_fee + a.insurance_fee as total from t a;
create table t (id integer, -- the key
  name text not null default 'a default value long enough to need wrapping' check (length(name) > 0), -- not empty
  created timestamp not null default now());
copy t (a, b) from stdin (format csv, -- comma separated
  header true, delimiter ';', null '', encoding 'UTF8');
