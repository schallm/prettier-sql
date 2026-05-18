create aggregate my_avg (float8) (
  sfunc = float8_accum,
  stype = float8[],
  initcond = '{0,0,0}'
);
