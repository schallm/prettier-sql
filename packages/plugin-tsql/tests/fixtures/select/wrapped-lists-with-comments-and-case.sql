select coalesce(a.very_long_column_name_one, -- first choice
  a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_four) as c from t a;
select iif(case when a.x = 1 then 1 end = 1, a.very_long_column_name_two, a.very_long_column_name_three) as c from t a;
select coalesce((select max(id) from u), a.very_long_column_name_two, a.very_long_column_name_three, a.very_long_four) as c from t a;
select a.id from t a where a.status in ('pending', 'shipped', -- the open states
  'cancelled', 'returned', 'refunded', 'on_hold', 'archived', 'deleted');
select a.id from t a where a.status in (a.very_long_column_name_one, case when a.x = 1 then 2 end, a.very_long_column_name_two);
select a.id, sum(case when a.x = 1 then a.very_long_column_name_one else a.very_long_column_name_two end) as total from t a group by a.id;
select a.base_amount + a.shipping_amount * a.tax_rate - a.discount_amount -- adjusted
  + a.handling_fee + a.insurance_fee as total from t a;
create table dbo.t (id int, -- the key
  name nvarchar(100) not null default 'a default value long enough to need wrapping' check (len(name) > 0), -- not empty
  created datetime2 not null default sysutcdatetime());
declare @message nvarchar(200) = N'The order was placed by ' + @customer_name -- who
  + N' on ' + convert(nvarchar(30), @order_date, 120);
alter table dbo.Orders drop constraint PK_Orders with (online = on, -- keep it online
  maxdop = 4, wait_at_low_priority (max_duration = 5 minutes, abort_after_wait = self));
