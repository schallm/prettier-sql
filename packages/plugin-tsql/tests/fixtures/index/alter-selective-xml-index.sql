-- Selective XML index: add and remove promoted paths
alter index sxi_Orders on dbo.Orders for (add CustomerId = '/order/@customerId' as sql int singleton, add Status = '/order/status' as xquery 'xs:string' maxlength(20), add Lines = '/order/lines' as xquery 'node()', remove OldPath)

alter index sxi_Orders on dbo.Orders with xmlnamespaces ('http://example.com/orders' as o) for (add Total = '/o:order/o:total' as sql decimal(10, 2))

alter index sxi_Orders on dbo.Orders for (remove Status)
