select a is document from t;
select a is not document from t;
select not a is document from t;
select * from t where (a || b) is document and c;
select xmlconcat(a, b) from t;
