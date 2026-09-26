-- ON CONFLICT target: expressions, collations and the partial-index WHERE

insert into t values (1) on conflict (lower(email) collate "C") where active do nothing;
