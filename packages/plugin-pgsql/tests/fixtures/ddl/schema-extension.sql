-- CREATE SCHEMA
create schema myschema;

create schema if not exists reporting;

create schema myschema authorization alice;

-- CREATE EXTENSION
create extension "uuid-ossp";

create extension if not exists "pgcrypto";

create extension if not exists hstore with schema s version '1.0' cascade;

-- an embedded quote in the version must round-trip escaped, or it doesn't parse
create extension e with version 'it''s';
