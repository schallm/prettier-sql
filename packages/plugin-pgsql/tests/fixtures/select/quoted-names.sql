-- A schema-qualified sort operator needs OPERATOR()
select a from t order by a using operator(pg_catalog.<), b using >;

-- A tablesample method is a function name
select * from t tablesample s."MySampler" (1), u tablesample "all" (2), v tablesample system (3);

do language "MyLang" 'x';

alter system set "MyExt"."Setting" = 1;

alter system reset "left";

create server s foreign data wrapper w options ("MixedCase" 'x');

alter foreign table f options (add "MixedCase" 'x');
