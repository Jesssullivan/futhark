-- |
-- Module      : Futhark.CLI.WebGPU
-- Description : Command-line interface for @futhark webgpu@
-- Stability   : experimental
--
-- This module implements the @futhark webgpu@ command, which compiles
-- Futhark programs to WebGPU-enabled C code for browser execution.
--
-- == Output Files
--
-- Running @futhark webgpu program.fut@ produces:
--
--   * @program.c@ - C code using the WebGPU C API
--   * @program.js@ - JavaScript wrapper for browser integration
--   * @program.json@ - Manifest describing entry points and types
--
-- == Compilation Pipeline
--
-- The WebGPU backend uses the same GPU optimization pipeline as CUDA\/OpenCL:
--
--   1. Parse and type-check the Futhark source
--   2. Apply GPU-specific optimizations ('gpumemPipeline')
--   3. Generate WebGPU code via 'compileWebGPUAction'
--
-- == Building the Output
--
-- The generated C code is compiled using Emscripten with the emdawnwebgpu port:
--
-- @
-- emcc program.c -o program.html --use-port=emdawnwebgpu
-- @
--
-- See the Futhark User's Guide for complete build instructions.
module Futhark.CLI.WebGPU (main) where

import Futhark.Actions (compileWebGPUAction)
import Futhark.Compiler.CLI
import Futhark.Passes (gpumemPipeline)

-- | Entry point for @futhark webgpu@.
--
-- Compiles a Futhark program to WebGPU-enabled C and JavaScript code.
-- Uses the GPU memory pipeline for optimizations, then generates code
-- via 'compileWebGPUAction'.
main :: String -> [String] -> IO ()
main = compilerMain
  ()
  []
  "Compile WebGPU"
  "Generate WebGPU C code from optimised Futhark program."
  gpumemPipeline
  $ \fcfg () mode outpath prog ->
    actionProcedure (compileWebGPUAction fcfg mode outpath) prog
