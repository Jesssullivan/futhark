-- |
-- Module      : Futhark.CodeGen.ImpCode.WebGPU
-- Description : WebGPU-specific imperative code representation
-- Stability   : experimental
--
-- This module defines the intermediate representation for WebGPU programs
-- after ImpGen but before C code generation.
--
-- == Structure
--
-- A WebGPU 'Program' consists of:
--
--   * __WGSL shader code__: The GPU program as a text string
--   * __Kernel interfaces__: Metadata about each kernel's parameters and bindings
--   * __Host definitions__: Imperative code for the CPU side
--   * __Runtime parameters__: Configurable constants like block sizes
--
-- == Kernel Interface
--
-- Each kernel is described by a 'KernelInterface' that specifies:
--
--   * Scalar parameter offsets in the uniform buffer
--   * Memory binding slot assignments
--   * Override declarations for dynamic values (block sizes, shared memory)
--   * The WGSL source code (for built-in kernels only)
--
-- == Relationship to Other Modules
--
-- This module re-exports 'Futhark.CodeGen.ImpCode.Kernels' which provides
-- the base imperative operations. The WebGPU-specific operations are
-- defined in terms of these base operations plus 'LaunchKernel'.
module Futhark.CodeGen.ImpCode.WebGPU
  ( KernelInterface (..),
    Program (..),
    module Futhark.CodeGen.ImpCode.Kernels,
  )
where

import Data.Map qualified as M
import Data.Text qualified as T
import Futhark.CodeGen.ImpCode.Kernels
import Futhark.Util.Pretty

-- | The interface to a WebGPU\/WGSL kernel.
--
-- This describes how to invoke a compiled WGSL compute shader from the host.
-- Arguments are passed in a specific order: shared memory sizes first, then
-- scalars (in a uniform buffer), and finally memory bindings (as storage buffers).
--
-- == Uniform Buffer Layout
--
-- Scalar arguments are packed into a single uniform buffer. The 'scalarsOffsets'
-- field gives the byte offset of each scalar within this buffer, following WGSL
-- alignment rules (e.g., i64 values need 8-byte alignment).
--
-- == Binding Slots
--
-- WebGPU uses binding slots to connect host buffers to shader resources.
-- The scalars uniform buffer gets 'scalarsBindSlot', and each memory argument
-- gets a slot from 'memBindSlots' in order.
--
-- == Override Declarations
--
-- WGSL @override@ declarations allow setting constant values at pipeline
-- creation time. These are used for:
--
--   * Block\/workgroup dimensions (when not statically known)
--   * Shared memory array sizes
--   * Other kernel-specific constants
data KernelInterface = KernelInterface
  { -- | Safety level for bounds checking and error handling.
    safety :: KernelSafety,
    -- | Byte offsets of all scalar fields in the uniform buffer struct.
    -- Order matches the order of 'ScalarUse' in the kernel's uses.
    scalarsOffsets :: [Int],
    -- | Total size in bytes of the scalars uniform buffer.
    -- Must be a multiple of 16 bytes per WGSL requirements.
    scalarsSize :: Int,
    -- | Binding slot index for the scalars uniform buffer.
    scalarsBindSlot :: Int,
    -- | Binding slot indices for all memory arguments, in order.
    memBindSlots :: [Int],
    -- | Names of all @override@ declarations used by the kernel.
    -- Used for the ad-hoc WGSL testing setup and to work around
    -- a Chrome\/Dawn bug (see @gpu_create_kernel@ in @rts\/c\/backends\/webgpu.h@).
    overrideNames :: [T.Text],
    -- | Dynamic block dimensions as @(dimension_index, override_name)@ pairs.
    -- Dimension 0 is x, 1 is y, 2 is z. Also included in 'overrideNames'.
    dynamicBlockDims :: [(Int, T.Text)],
    -- | Override names for shared memory array sizes.
    -- Also included in 'overrideNames'.
    sharedMemoryOverrides :: [T.Text],
    -- | WGSL source code for built-in kernels (transpose, copy, etc.).
    -- For user kernels, this is empty as the code is in 'webgpuProgram'.
    gpuProgram :: T.Text
  }

-- | A complete WebGPU program ready for C code generation.
--
-- This combines the WGSL shader code, kernel metadata, and host-side
-- imperative code into a single package that 'Futhark.CodeGen.Backends.CWebGPU'
-- transforms into compilable C code.
data Program = Program
  { -- | The main WGSL program text containing all user-defined kernels.
    -- Does not include the prelude or built-in kernels.
    webgpuProgram :: T.Text,
    -- | WGSL prelude code that must be prepended to the program.
    -- Contains type definitions, helper functions, and built-in operations.
    webgpuPrelude :: T.Text,
    -- | Constant expressions to be set as @override@ values at runtime.
    -- These are evaluated during kernel compilation to set block sizes,
    -- shared memory sizes, and other compile-time constants.
    webgpuMacroDefs :: [(Name, KernelConstExp)],
    -- | Map from kernel names to their interfaces.
    -- Includes both user-defined and built-in kernels.
    webgpuKernels :: M.Map KernelName KernelInterface,
    -- | Runtime-configurable parameters (tuning knobs).
    -- Maps parameter names to their size class and dependent kernels.
    webgpuParams :: ParamMap,
    -- | Error messages for assertion failures, indexed by failure code.
    webgpuFailures :: [FailureMsg],
    -- | Host-side imperative code that orchestrates kernel launches.
    hostDefinitions :: Definitions HostOp
  }

instance Pretty Program where
  pretty prog =
    -- TODO: print everything
    "webgpu {"
      </> indent 2 (stack $ map pretty $ T.lines $ webgpuPrelude prog)
      </> indent 2 (stack $ map pretty $ T.lines $ webgpuProgram prog)
      </> "}"
      </> ""
      <> pretty (hostDefinitions prog)
