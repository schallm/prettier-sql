-- A trailing comment on a CHECK constraint's condition stays right after the
-- condition, on its own line, and doesn't swallow the closing paren that follows it.
create table t (
  a int check (a > 0 -- c
  ),
  constraint ck2 check (a < 100 -- c2
  )
);

alter table t
add constraint ck3 check (a <> 0 -- c3
);
