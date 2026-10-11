security label for my_provider on table orders is 'sensitive';

security label for my_provider on column orders.amount is 'pii';

-- an embedded quote in the label must round-trip escaped, or it doesn't parse
security label for my_provider on table orders is 'it''s sensitive';

-- FOR provider is optional
security label on table orders is 'sensitive';

-- A provider name that needs quotes
security label for "MyProvider" on table t is 'x';
