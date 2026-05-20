-- CREATE SCHEMA
create schema myschema;

create schema if not exists reporting;

create schema myschema authorization alice;

-- CREATE EXTENSION
create extension "uuid-ossp";

create extension if not exists "pgcrypto";
