-- Unary operators: a double negation must not become a -- comment
select -a, - -a, -(-a), - - -1, ~a, ~(~a), +a, 1 - -1, a - -b
from t;
