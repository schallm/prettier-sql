-- A comment right after the joined table (before ON) must stay there, and formatting
-- twice must produce the same output.
select a from t join u -- j
 on t.a = u.a -- on
left join v on v.a = u.a /* v */
