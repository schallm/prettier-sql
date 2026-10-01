select * from ::fn_trace_getinfo(0) as t;
select * from ::fn_virtualfilestats(1, 1);
select * from openquery(Srv, 'select ''x'' as a') as q;
select * from openquery([My Srv], 'select 1');
