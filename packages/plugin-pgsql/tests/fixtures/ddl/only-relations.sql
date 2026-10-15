-- ONLY: the table itself, without inheritance children or partitions
vacuum only measurements;
analyze only measurements (city_id, logdate);
vacuum (verbose, analyze) only measurements, cities;
create publication pub_only for table only measurements, cities (id, name) where (id > 0);
create publication pub_mixed for table only pubme.t0 (c, d) where (c > 0), tables in schema pubme;
alter publication pub_only add table only cities;
