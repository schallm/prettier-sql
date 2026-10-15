-- .f(): a scalar UDF in the default schema; without the dot it would be a built-in function call
select .LateFee(DueDate, default) as Fee, ..LateFee(DueDate, 2) as Fee2 from Loans;
