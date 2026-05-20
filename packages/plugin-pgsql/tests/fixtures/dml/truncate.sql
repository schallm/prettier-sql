-- Multi-table TRUNCATE with pgsql options
truncate table sessions, temp_orders restart identity cascade;
