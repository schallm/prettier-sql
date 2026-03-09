update Books set InStock = 0 from Books inner join Publishers on Books.PublisherId = Publishers.Id where Publishers.Country = 'UK'
