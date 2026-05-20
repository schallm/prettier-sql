-- Type modifiers (varchar length, numeric precision/scale)
CREATE TABLE products (
  name VARCHAR(100),
  description TEXT,
  price NUMERIC(10, 2),
  quantity INTEGER,
  tags TEXT[],
  created_at TIMESTAMPTZ
);
