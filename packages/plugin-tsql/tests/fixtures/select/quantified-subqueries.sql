select a from t where c > all (select 1) and d = any (select b from u) and e <> some (select 2)
