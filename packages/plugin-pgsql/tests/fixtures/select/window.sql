-- GROUPS frame (pgsql-specific frame mode)
select dept, salary, count(*) over (order by dept groups between 1 preceding and 1 following) as nearby_count from emp;
