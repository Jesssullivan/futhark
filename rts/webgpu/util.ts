// Start of util.js

// Note: FutharkErrorContext and FutharkError interfaces are declared in types/futhark.d.ts

/**
 * Custom error class for Futhark runtime errors.
 * Provides additional context about the operation that failed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FutharkError extends Error {
  /** Additional context about the error */
  public readonly context: FutharkErrorContext;

  /**
   * Creates a new FutharkError.
   * @param message - Error message
   * @param context - Additional context about the error
   */
  constructor(message: string, context: FutharkErrorContext = {}) {
    super(message);
    this.name = 'FutharkError';
    this.context = context;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    const ErrorWithCapture = Error as ErrorConstructor & {
      captureStackTrace?: (target: object, constructorOpt?: Function) => void
    };
    if (typeof ErrorWithCapture.captureStackTrace === 'function') {
      ErrorWithCapture.captureStackTrace(this, FutharkError);
    }
  }

  /**
   * Returns a detailed string representation including context.
   */
  override toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (Object.keys(this.context).length > 0) {
      result += `\n  Context: ${JSON.stringify(this.context, null, 2)}`;
    }
    return result;
  }
}

/**
 * Asserts a condition and throws FutharkError if false.
 * @param condition - The condition to check
 * @param message - Optional error message
 * @param context - Optional error context
 * @throws FutharkError if condition is false
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function futhark_assert(
  condition: boolean,
  message?: string,
  context?: FutharkErrorContext
): asserts condition {
  if (!condition) {
    throw new FutharkError(message || "Assertion failed", context);
  }
}

/**
 * Creates a primitive type info object.
 * @param tag - Tag used in the binary data format
 * @param size - Size in bytes of the primitive type
 * @param scalar_type - JavaScript scalar type constructor
 * @param array_type - TypedArray constructor
 * @param create_array - Factory to create typed array
 * @param get_heap - Function to get the appropriate WASM heap
 * @returns The primitive type info object
 */
function make_prim_info(
  tag: string,
  size: number,
  scalar_type: NumberConstructor | BigIntConstructor | BooleanConstructor,
  array_type: TypedArrayConstructor,
  create_array: (heap: ArrayBufferLike, byteOffset?: number, length?: number) => TypedArray,
  get_heap: (m: EmscriptenModule) => TypedArray
): PrimInfo {
  return {
    tag: tag, // tag used in the binary data format
    size: size,
    scalar_type: scalar_type,
    array_type: array_type,
    get_heap: get_heap,
    create_array: create_array,
  };
}

/**
 * Mapping from Futhark type names to their primitive info.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const primInfos: Record<string, PrimInfo> = {
  'bool': make_prim_info("bool", 1, Boolean, Uint8Array,     (h, ...args) => new Uint8Array(h, ...args),     (m) => m.HEAPU8),
    'u8': make_prim_info("  u8", 1, Number,  Uint8Array,     (h, ...args) => new Uint8Array(h, ...args),     (m) => m.HEAPU8),
    'i8': make_prim_info("  i8", 1, Number,  Int8Array,      (h, ...args) => new Int8Array(h, ...args),      (m) => m.HEAP8),
   'u16': make_prim_info(" u16", 2, Number,  Uint16Array,    (h, ...args) => new Uint16Array(h, ...args),    (m) => m.HEAPU16),
   'i16': make_prim_info(" i16", 2, Number,  Int16Array,     (h, ...args) => new Int16Array(h, ...args),     (m) => m.HEAP16),
   'u32': make_prim_info(" u32", 4, Number,  Uint32Array,    (h, ...args) => new Uint32Array(h, ...args),    (m) => m.HEAPU32),
   'i32': make_prim_info(" i32", 4, Number,  Int32Array,     (h, ...args) => new Int32Array(h, ...args),     (m) => m.HEAP32),
   'u64': make_prim_info(" u64", 8, BigInt,  BigUint64Array, (h, ...args) => new BigUint64Array(h, ...args), (m) => m.HEAPU64),
   'i64': make_prim_info(" i64", 8, BigInt,  BigInt64Array,  (h, ...args) => new BigInt64Array(h, ...args),  (m) => m.HEAP64),
   // There is no WASM heap for f16 values since Float16Array was only recently (april 2025) made available in browser baselines,
   // so we have to do this ugly workaround to reinterpret Uint16 bytes as Float16 when reading from the WASM HEAPU16...
   'f16': make_prim_info(" f16", 2, Number,  Float16Array,   (h, ...args) => new Float16Array(new Uint16Array(h, ...args).buffer), (m) => m.HEAPU16),
   'f32': make_prim_info(" f32", 4, Number,  Float32Array,   (h, ...args) => new Float32Array(h, ...args),   (m) => m.HEAPF32),
   'f64': make_prim_info( "f64", 8, Number,  Float64Array,   (h, ...args) => new Float64Array(h, ...args),   (m) => m.HEAPF64),
};

// End of util.js
