-- CREATE VIEW with column aliases
create view order_summary (order_id, total, status) as
select id, amount, status from orders;

-- CREATE OR REPLACE VIEW
create or replace view active_users as
select id, name, email from users where active = true and deleted_at is null;

-- CREATE MATERIALIZED VIEW
create materialized view user_stats as
select user_id, count(*) as order_count, sum(amount) as total_spent from orders group by user_id;

-- REFRESH MATERIALIZED VIEW
refresh materialized view user_stats;

refresh materialized view concurrently user_stats;

-- DROP MATERIALIZED VIEW
drop materialized view if exists stale_cache;
