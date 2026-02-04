{-# LANGUAGE TemplateHaskell #-}

-- |
-- Module      : Futhark.CodeGen.RTS.WebGPU
-- Description : JavaScript runtime code for WebGPU browser execution
-- Stability   : experimental
--
-- This module embeds JavaScript code snippets that provide the browser-side
-- runtime for WebGPU programs. The JavaScript code handles:
--
--   * Async WebGPU operations (buffer mapping, command submission)
--   * Value marshalling between JavaScript and WebAssembly
--   * Server protocol implementation for @futhark test@
--   * High-level wrappers for entry point functions
--
-- == Embedded Files
--
-- The JavaScript code is embedded at compile time from @rts\/webgpu\/*.js@:
--
--   * @util.js@ - Utility functions for the runtime
--   * @values.js@ - Value type handling and marshalling
--   * @wrappers.js@ - High-level async wrappers for Futhark entry points
--   * @server_ws.js@ - WebSocket server for the Futhark server protocol
--
-- == Usage in Generated Code
--
-- The generated JavaScript wrapper (see 'Futhark.CodeGen.Backends.CWebGPU')
-- combines these snippets with generated entry point code to create a
-- complete @FutharkModule@ class for browser use.
module Futhark.CodeGen.RTS.WebGPU
  ( -- * JavaScript Runtime Components
    serverWsJs,
    utilJs,
    valuesJs,
    wrappersJs,
  )
where

import Data.FileEmbed
import Data.Text qualified as T

-- | WebSocket server implementation for the Futhark server protocol.
--
-- Used by @futhark test --backend=webgpu@ to run tests in a browser
-- environment. Implements the bidirectional protocol over WebSocket
-- instead of stdio.
--
-- Embedded from @rts\/webgpu\/server_ws.js@.
serverWsJs :: T.Text
serverWsJs = $(embedStringFile "rts/webgpu/server_ws.js")
{-# NOINLINE serverWsJs #-}

-- | General utility functions for the JavaScript runtime.
--
-- Includes helper functions used by other runtime components.
--
-- Embedded from @rts\/webgpu\/util.js@.
utilJs :: T.Text
utilJs = $(embedStringFile "rts/webgpu/util.js")
{-# NOINLINE utilJs #-}

-- | Value marshalling code for Futhark types.
--
-- Handles conversion between JavaScript values (ArrayBuffer, TypedArray)
-- and the WebAssembly linear memory format used by Futhark.
--
-- Embedded from @rts\/webgpu\/values.js@.
valuesJs :: T.Text
valuesJs = $(embedStringFile "rts/webgpu/values.js")
{-# NOINLINE valuesJs #-}

-- | High-level async wrappers for entry point functions.
--
-- Provides the @make_entry_function@ and @make_array_class@ factories
-- that create user-friendly async JavaScript APIs for Futhark entry points
-- and array types.
--
-- Embedded from @rts\/webgpu\/wrappers.js@.
wrappersJs :: T.Text
wrappersJs = $(embedStringFile "rts/webgpu/wrappers.js")
{-# NOINLINE wrappersJs #-}
