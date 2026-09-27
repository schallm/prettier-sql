-- Comments after USING's source and after the ON condition must stay near what
-- they followed, not move to the end of the statement.
merge t using s -- src
on t.id = s.id -- on
when matched then update set a = s.a -- upd
when not matched then insert (a) values (s.a); -- ins
