-- Test i8 bitwise operations in WebGPU (emulated via i32).
-- Ensures bitwise operations correctly handle sign extension
-- and masking when packed into i32.

-- ==
-- entry: land
-- input { [0i8, 0i8, 127i8, -128i8, -1i8, 0x55i8]
--         [0i8, -1i8, -128i8, 127i8, -1i8, 0xAAi8] }
-- output { [0i8, 0i8, 0i8, 0i8, -1i8, 0i8] }

-- ==
-- entry: lor
-- input { [0i8, 0i8, 127i8, -128i8, 0x55i8]
--         [0i8, -1i8, -128i8, 127i8, 0xAAi8] }
-- output { [0i8, -1i8, -1i8, -1i8, -1i8] }

-- ==
-- entry: lxor
-- input { [0i8, 0i8, 127i8, -128i8, -1i8, 0x55i8]
--         [0i8, -1i8, 127i8, -128i8, -1i8, 0x55i8] }
-- output { [0i8, -1i8, 0i8, 0i8, 0i8, 0i8] }

-- ==
-- entry: shl
-- input { [1i8, 1i8, 1i8, -1i8, 64i8]
--         [0i8, 1i8, 7i8, 1i8, 1i8] }
-- output { [1i8, 2i8, -128i8, -2i8, -128i8] }

-- ==
-- entry: shr
-- input { [1i8, 2i8, -128i8, -1i8, -128i8]
--         [0i8, 1i8, 7i8, 1i8, 1i8] }
-- output { [1i8, 1i8, -1i8, -1i8, -64i8] }

-- ==
-- entry: ushr
-- input { [1i8, 2i8, -128i8, -1i8, -128i8]
--         [0i8, 1i8, 7i8, 1i8, 1i8] }
-- output { [1i8, 1i8, 1i8, 127i8, 64i8] }

-- ==
-- entry: complement
-- input { [0i8, -1i8, 127i8, -128i8, 0x55i8] }
-- output { [-1i8, 0i8, -128i8, 127i8, -86i8] }

entry land = map2 (i8.&)
entry lor = map2 (i8.|)
entry lxor = map2 (i8.^)
entry shl = map2 (i8.<<)
entry shr = map2 (i8.>>)
entry ushr = map2 (i8.>>>)
entry complement = map i8.not
