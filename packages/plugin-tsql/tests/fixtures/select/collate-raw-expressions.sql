-- COLLATE on an expression kept as written is printed once
select {d '2020-01-01'} collate Latin1_General_BIN, {ts '2020-01-01 00:00:00'} collate Latin1_General_BIN;
