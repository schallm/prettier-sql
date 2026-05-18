create table orders_copy (
  like orders including all
);

create table orders_partial (
  extra_col text,
  like orders including defaults including indexes
);
