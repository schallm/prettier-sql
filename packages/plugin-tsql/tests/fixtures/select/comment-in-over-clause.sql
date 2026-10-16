select
    row_number() over (partition by b /* part */ order by c /* ord */ desc) as rn,
    sum(a) over (partition by b -- by b
        order by c) as total
from t;
