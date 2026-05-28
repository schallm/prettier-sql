merge top (1000) into dbo.Target as t
using dbo.Source as s on t.Id = s.Id
when matched then
  update set t.Name = s.Name
when not matched then
  insert (Id, Name)
  values (s.Id, s.Name);
