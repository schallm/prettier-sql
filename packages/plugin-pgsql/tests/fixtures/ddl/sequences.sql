-- CREATE SEQUENCE with options
create sequence order_seq
start with 1000
increment by 1
no maxvalue
no cycle;

-- CREATE SEQUENCE minimal
create sequence event_seq;

-- ALTER SEQUENCE
alter sequence order_seq
restart with 1
increment by 5;
