-- Identifiers that need double quotes must keep them: mixed case, spaces, keywords
select "Col A", t."B", "Sch"."Fn"(1), "MixedCase"(2), left(x, 2), "left", "select" from "My Table" as t join "S"."T" as u on u."Id" = t."Id";
select a as "Total Amount", "a""b", x::"MyType", x::public."MyType", ("Arr")[1], (t."Rec")."Field" from t;
with "Cte" as (select 1) select count(*) over "W" from "Cte" window "W" as (order by "X");
select f("Named Arg" => 1) from t join u using ("Id", id2);
insert into "T" ("A", "b c") values (1, 2);
update "T" set "A" = 1 where "B" = 2;
delete from "S"."T" using "U" where "T"."Id" = "U"."Id";
create table "T" ("Id" int primary key, "Name" text constraint "Nm_Chk" check ("Name" <> ''), foreign key ("Id") references "Other" ("Id"));
create index "Ix" on "T" ("Col", lower("Name"));
alter table "T" rename column "A" to "B";
create function "Fn"("P" int) returns int language sql as $$ select 1 $$;
drop table "T", "S"."U";
grant select on "T" to "Role Name";
create schema "My Schema";
