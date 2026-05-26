-- Service Broker statements — END CONVERSATION must include the handle variable

end conversation @handle

end conversation @handle with cleanup

end conversation @handle
    with error = 50001 description = 'Order processing failed'

-- BEGIN DIALOG
begin dialog conversation @handle
    from service OrderService
    to service 'TargetService'
    on contract OrderContract
    with lifetime = 3600

-- SEND ON CONVERSATION
send on conversation @handle
    message type OrderMessage
    (N'<order><id>1</id></order>')

-- RECEIVE
receive top (10)
    conversation_handle,
    message_body
from dbo.OrderQueue

-- GET CONVERSATION GROUP
get conversation group @group_id from dbo.OrderQueue

-- MOVE CONVERSATION
move conversation @handle to @group_id
