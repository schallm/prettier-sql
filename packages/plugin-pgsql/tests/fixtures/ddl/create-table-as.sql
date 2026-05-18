-- CREATE TABLE AS SELECT
create table archived_orders as
select
  id,
  customer_id,
  amount
from
  orders
where status = 'cancelled';

-- CREATE MATERIALIZED VIEW
create materialized view mv_active_users as
select
  id,
  name,
  email
from
  users
where active = true;
