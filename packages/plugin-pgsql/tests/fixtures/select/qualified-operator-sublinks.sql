-- A schema-qualified operator in ANY / ALL / row comparison sublinks
select a from t where a operator(pg_catalog.=) any (select 1) and a operator(pg_catalog.<) all (select 2) and (a, b) operator(pg_catalog.<) (select 1, 2);
