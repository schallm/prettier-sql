create collation my_coll (locale = 'en-US');

create collation my_coll2 from "en-US";

create collation if not exists german_ci (provider = icu, locale = 'de-u-ks-level2', deterministic = false);

create collation if not exists my_c from "C";
