-- OVERRIDING SYSTEM VALUE (pgsql-specific)
insert into users (id, email) overriding system value values (100, 'admin@example.com');

-- OVERRIDING USER VALUE (pgsql-specific)
insert into users (id, email) overriding user value values (101, 'user@example.com');
