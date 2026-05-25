-- XML instance method calls on XML-typed columns
select
  Data.value('(/root/id)[1]', 'int') as Id,
  Data.query('/root/name') as NameXml,
  Data.exist('/root/active') as IsActive
from XmlDocs

-- XML nodes() cross apply (column alias rendered as raw text for now)
select XmlDoc.value('(./Id)[1]', 'int') as Id
from XmlDocs
cross apply Data.nodes('/root/item') as n
