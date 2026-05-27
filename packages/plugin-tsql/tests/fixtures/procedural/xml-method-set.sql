declare @xmlDoc xml = '<root><item id="1"><name>Widget</name></root>'
set @xmlDoc.modify('insert <tag>val</tag> as last into (/root)[1]')
set @xmlDoc.modify('delete (/root/item[@id=1])[1]')
set @xmlDoc.modify('replace value of (/root/item/name/text())[1] with "Gadget"')
