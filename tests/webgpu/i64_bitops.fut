-- Test i64 bitwise operations in WebGPU (emulated via vec2<u32>).
-- Ensures bitwise operations correctly handle the split representation
-- and properly propagate operations across both 32-bit halves.

-- ==
-- entry: land
-- input { [0i64, -1i64, 0xFFFFFFFF00000000i64, 0x00000000FFFFFFFFi64, 0x5555555555555555i64]
--         [0i64, -1i64, 0x00000000FFFFFFFFi64, 0xFFFFFFFF00000000i64, 0xAAAAAAAAAAAAAAAAi64] }
-- output { [0i64, -1i64, 0i64, 0i64, 0i64] }

-- ==
-- entry: lor
-- input { [0i64, 0i64, 0xFFFFFFFF00000000i64, 0x00000000FFFFFFFFi64, 0x5555555555555555i64]
--         [0i64, -1i64, 0x00000000FFFFFFFFi64, 0xFFFFFFFF00000000i64, 0xAAAAAAAAAAAAAAAAi64] }
-- output { [0i64, -1i64, -1i64, -1i64, -1i64] }

-- ==
-- entry: lxor
-- input { [0i64, -1i64, 0xFFFFFFFF00000000i64, 0x123456789ABCDEFi64]
--         [0i64, -1i64, 0xFFFFFFFF00000000i64, 0x123456789ABCDEFi64] }
-- output { [0i64, 0i64, 0i64, 0i64] }

-- ==
-- entry: shl
-- input { [1i64, 1i64, 1i64, 0xFFFFFFFFi64, -1i64]
--         [0i64, 32i64, 63i64, 32i64, 1i64] }
-- output { [1i64, 0x100000000i64, -9223372036854775808i64, 0xFFFFFFFF00000000i64, -2i64] }

-- ==
-- entry: shr
-- input { [1i64, 0x100000000i64, -9223372036854775808i64, -1i64, -0x100000000i64]
--         [0i64, 32i64, 63i64, 1i64, 32i64] }
-- output { [1i64, 1i64, -1i64, -1i64, -1i64] }

-- ==
-- entry: ushr
-- input { [1i64, 0x100000000i64, -9223372036854775808i64, -1i64]
--         [0i64, 32i64, 63i64, 1i64] }
-- output { [1i64, 1i64, 1i64, 9223372036854775807i64] }

-- ==
-- entry: complement
-- input { [0i64, -1i64, 0x5555555555555555i64, 0xFFFFFFFF00000000i64] }
-- output { [-1i64, 0i64, -6148914691236517206i64, 0x00000000FFFFFFFFi64] }

entry land = map2 (i64.&)
entry lor = map2 (i64.|)
entry lxor = map2 (i64.^)
entry shl = map2 (i64.<<)
entry shr = map2 (i64.>>)
entry ushr = map2 (i64.>>>)
entry complement = map i64.not
