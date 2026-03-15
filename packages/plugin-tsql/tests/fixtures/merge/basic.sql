merge into Books as tgt
using (
    select Id, Title, Price, InStock
    from BookUpdates
) as src
    on tgt.Id = src.Id
when matched and src.InStock = 0 then
    delete
when matched then
    update set
        tgt.Title = src.Title,
        tgt.Price = src.Price,
        tgt.InStock = src.InStock
when not matched by target then
    insert (Title, Price, InStock)
    values (src.Title, src.Price, src.InStock);

merge into Books as tgt
using BookUpdates as src
    on tgt.Id = src.Id
when matched and tgt.Price <> src.Price then
    update set tgt.Price = src.Price
when not matched by target then
    insert (Title, Price, InStock)
    values (src.Title, src.Price, 1)
when not matched by source then
    update set tgt.InStock = 0;

merge into Books as tgt
using BookUpdates as src
    on tgt.Id = src.Id
when matched then
    update set tgt.Title = src.Title, tgt.Price = src.Price
when not matched by target then
    insert (Title, Price, InStock)
    values (src.Title, src.Price, src.InStock)
output $action, inserted.Id, inserted.Title, deleted.Price;
