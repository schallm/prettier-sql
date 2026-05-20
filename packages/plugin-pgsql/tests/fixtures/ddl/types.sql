-- CREATE TYPE composite
create type address as (
  street text,
  city varchar(100),
  zip varchar(10)
);

-- CREATE TYPE enum
create type mood as enum (
  'sad',
  'ok',
  'happy'
);

-- ALTER TYPE ADD VALUE
alter type mood add value 'excited' after 'happy';

alter type mood add value if not exists 'meh' before 'ok';
