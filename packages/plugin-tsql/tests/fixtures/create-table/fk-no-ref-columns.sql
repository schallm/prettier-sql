-- REFERENCES with no explicit column list must not print an empty () (bug: unparseable)
create table t (a int references u (id), foreign key (a) references u)
