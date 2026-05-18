-- RENAME COLUMN
alter table users rename column email to email_address;

-- RENAME TABLE
alter table users rename to customers;

-- ALTER COLUMN TYPE
alter table products alter column price type numeric(12, 4);

-- SET DEFAULT
alter table users alter column active set default true;

-- DROP DEFAULT
alter table users alter column active drop default;

-- SET NOT NULL
alter table orders alter column status set not null;

-- DROP NOT NULL
alter table orders alter column notes drop not null;
