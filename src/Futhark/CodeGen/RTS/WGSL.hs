{-# LANGUAGE TemplateHaskell #-}

-- |
-- Module      : Futhark.CodeGen.RTS.WGSL
-- Description : WGSL runtime shader code for WebGPU
-- Stability   : experimental
--
-- This module embeds WGSL (WebGPU Shading Language) code snippets that are
-- included in every WebGPU program. These provide the runtime support
-- functions needed by generated kernels.
--
-- == Embedded Files
--
-- The WGSL code is embedded at compile time from @rts\/wgsl\/*.wgsl@:
--
--   * @scalar.wgsl@ - Basic scalar operations and constants
--   * @scalar8.wgsl@ - 8-bit integer emulation (packed in i32)
--   * @scalar16.wgsl@ - 16-bit integer emulation (packed in i32)
--   * @scalar32.wgsl@ - 32-bit operations and utilities
--   * @scalar64.wgsl@ - 64-bit integer emulation using @vec2\<i32\>@
--   * @atomics.wgsl@ - Atomic operation implementations
--
-- == Built-in Kernels
--
-- This module also provides built-in kernel templates for common operations:
--
--   * 'lmad_copy' - Generic array copy with LMAD (linear memory access descriptor)
--   * 'map_transpose' - Matrix transpose with shared memory tiling
--   * Transpose variants for different matrix shapes (low height, low width, small, large)
--
-- These templates use placeholder names (@NAME@, @ELEM_TYPE@) that are
-- substituted at code generation time.
--
-- == Prelude
--
-- The 'wgsl_prelude' combines all scalar support code into a single text
-- block that is prepended to every generated WGSL program.
module Futhark.CodeGen.RTS.WGSL
  ( scalar,
    scalar8,
    scalar16,
    scalar32,
    scalar64,
    atomics,
    wgsl_prelude,
    lmad_copy,
    map_transpose,
    map_transpose_low_height,
    map_transpose_low_width,
    map_transpose_small,
    map_transpose_large,
  )
where

import Data.FileEmbed
import Data.Text qualified as T

-- | @rts/wgsl/scalar.wgsl@
scalar :: T.Text
scalar = $(embedStringFile "rts/wgsl/scalar.wgsl")
{-# NOINLINE scalar #-}

-- | @rts/wgsl/scalar8.wgsl@
scalar8 :: T.Text
scalar8 = $(embedStringFile "rts/wgsl/scalar8.wgsl")
{-# NOINLINE scalar8 #-}

-- | @rts/wgsl/scalar16.wgsl@
scalar16 :: T.Text
scalar16 = $(embedStringFile "rts/wgsl/scalar16.wgsl")
{-# NOINLINE scalar16 #-}

-- | @rts/wgsl/scalar32.wgsl@
scalar32 :: T.Text
scalar32 = $(embedStringFile "rts/wgsl/scalar32.wgsl")
{-# NOINLINE scalar32 #-}

-- | @rts/wgsl/scalar64.wgsl@
scalar64 :: T.Text
scalar64 = $(embedStringFile "rts/wgsl/scalar64.wgsl")
{-# NOINLINE scalar64 #-}

-- | @rts/wgsl/atomics.wgsl@
atomics :: T.Text
atomics = $(embedStringFile "rts/wgsl/atomics.wgsl")
{-# NOINLINE atomics #-}

-- | The complete WGSL prelude prepended to all generated programs.
--
-- Includes:
--
--   * @enable f16;@ directive for 16-bit float support
--   * Scalar operations (32-bit first, then 8\/16\/64-bit emulation)
--   * Atomic operation implementations
--
-- The ordering is important: scalar32 must come before scalar8\/16\/64
-- because they all use i32 internally.
wgsl_prelude :: T.Text
wgsl_prelude =
  -- Put scalar32 in front of the other integer types since they are all
  -- internally represented using i32.
  mconcat
    [ "enable f16;\n",
      scalar,
      scalar32,
      scalar8,
      scalar16,
      scalar64,
      atomics
    ]

-- | @rts/wgsl/lmad_copy.wgsl@
lmad_copy :: T.Text
lmad_copy = $(embedStringFile "rts/wgsl/lmad_copy.wgsl")
{-# NOINLINE lmad_copy #-}

-- | @rts/wgsl/map_transpose.wgsl@
map_transpose :: T.Text
map_transpose = $(embedStringFile "rts/wgsl/map_transpose.wgsl")
{-# NOINLINE map_transpose #-}

-- | @rts/wgsl/map_transpose_low_height.wgsl@
map_transpose_low_height :: T.Text
map_transpose_low_height = $(embedStringFile "rts/wgsl/map_transpose_low_height.wgsl")
{-# NOINLINE map_transpose_low_height #-}

-- | @rts/wgsl/map_transpose_low_width.wgsl@
map_transpose_low_width :: T.Text
map_transpose_low_width = $(embedStringFile "rts/wgsl/map_transpose_low_width.wgsl")
{-# NOINLINE map_transpose_low_width #-}

-- | @rts/wgsl/map_transpose_small.wgsl@
map_transpose_small :: T.Text
map_transpose_small = $(embedStringFile "rts/wgsl/map_transpose_small.wgsl")
{-# NOINLINE map_transpose_small #-}

-- | @rts/wgsl/map_transpose_large.wgsl@
map_transpose_large :: T.Text
map_transpose_large = $(embedStringFile "rts/wgsl/map_transpose_large.wgsl")
{-# NOINLINE map_transpose_large #-}
