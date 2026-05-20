bulk insert Books from 'C:\data\books.csv'

bulk insert Books from 'C:\data\books.csv' with (fieldterminator = ',', rowterminator = '\n', firstrow = 2)

bulk insert Orders from 'C:\data\orders.csv' with (fieldterminator = '|', rowterminator = '\n', firstrow = 2, maxerrors = 10)
