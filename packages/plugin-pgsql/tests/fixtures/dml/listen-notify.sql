listen my_channel;

unlisten my_channel;

unlisten *;

notify my_channel;

notify my_channel, 'payload text';

-- an embedded quote in the payload must round-trip escaped, or it doesn't parse
notify my_channel, 'it''s here';
