-- REFERENCES with no explicit column list must not print an empty () (bug: unparseable)
alter table t with nocheck add constraint fk foreign key (a) references u
