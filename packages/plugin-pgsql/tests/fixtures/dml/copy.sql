copy orders from '/tmp/orders.csv';

copy orders to '/tmp/orders.csv';

copy (select id from orders) to '/tmp/ids.csv';
