-- IF EXISTS on the statement and on each subcommand
alter table if exists orders drop column if exists legacy cascade;
alter table orders drop constraint if exists old_check cascade;

-- ADD COLUMN IF NOT EXISTS (the same missing_ok flag as the DROPs)
alter table orders add column if not exists notes text;

-- ONLY: don't recurse into inheritance children / partitions
alter table only measurements drop column raw;

-- Other relation kinds keep their keyword
alter view if exists order_summary alter column total set default 0;
alter materialized view if exists sales_mv set schema archive;

-- SET SCHEMA on a schema-qualified table
alter table if exists app.orders set schema archive;
