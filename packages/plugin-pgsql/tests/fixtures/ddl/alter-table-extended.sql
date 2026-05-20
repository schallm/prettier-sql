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

-- ADD COLUMN
alter table users add column phone text;

alter table users add column verified boolean not null default false;

-- DROP COLUMN
alter table users drop column phone;

alter table users drop column if exists legacy_field;

-- ADD CONSTRAINT (table-level)
alter table order_items add constraint fk_order foreign key (order_id) references orders (id);

alter table products add constraint price_positive check (price > 0);

alter table users add constraint users_email_unique unique (email);

-- DROP CONSTRAINT
alter table products drop constraint price_positive;

alter table products drop constraint if exists old_check;
