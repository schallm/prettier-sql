-- A CLR trigger is its EXTERNAL NAME, with no body
create trigger dbo.tg on dbo.t after insert as external name asm.cls.mth

go

create trigger tg2 on database for create_table as external name asm.cls.mth
