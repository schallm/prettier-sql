-- A comment inside the ELSE branch's statement stays in that branch
if @a = 1 select 1 else select /* two */ 2;
