-- Compound assignment operators must all be preserved
declare @n int = 10
set @n += 5
set @n -= 3
set @n *= 2
set @n /= 4
set @n %= 3
set @n &= 0xFF
set @n |= 0x01
set @n ^= 0xAA
