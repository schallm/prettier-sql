-- CREATE DATABASE options, containment and attach forms stay as written
create database d collate latin1_general_100_ci_as_sc with catalog_collation = sql_latin1_general_cp1_ci_as, ledger = on

create database d with trustworthy on, db_chaining on

create database d containment = partial

create database d (edition = 'basic', service_objective = 'basic')

create database s on (name = f1, filename = 'c:\s1.ss') as snapshot of d
