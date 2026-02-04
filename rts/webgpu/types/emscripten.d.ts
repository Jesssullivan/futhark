/**
 * Emscripten module interface for Futhark WebGPU runtime.
 */
interface EmscriptenModule {
  // Typed arrays for memory access
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAPU16: Uint16Array;
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  HEAP64: BigInt64Array;
  HEAPU64: BigUint64Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;

  // Memory management
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Function calling
  ccall(
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: any[],
    opts?: { async?: boolean }
  ): any;

  cwrap(
    ident: string,
    returnType: string | null,
    argTypes: string[]
  ): (...args: any[]) => any;
}

declare function Module(): Promise<EmscriptenModule>;
