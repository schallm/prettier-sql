select id, name into archive_users from users where active = false;

-- Every clause of a SELECT INTO is kept, and so is an INTO in a set operation or a subquery
with recent as (select id, name from users where created_at > now() - interval '7 days')
select distinct name into temporary recent_names from recent order by name for update;

select id into archive_ids from users where active = false union select id from deleted_users;
