vacuum orders;

vacuum verbose orders;

vacuum (full, analyze) orders;

analyze orders;

cluster orders using orders_region_idx;

reindex table orders;

reindex (verbose) table orders;
