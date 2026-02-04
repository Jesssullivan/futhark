/**
 * Error context for Futhark operations.
 */
interface FutharkErrorContext {
  /** The operation that failed */
  operation?: string;
  /** The Futhark type involved */
  type?: string;
  /** Additional details - allow any string key with any value */
  [key: string]: unknown;
}

/**
 * Float16Array type declaration (added to browser baseline in April 2025).
 * TypeScript's ES2022 lib doesn't include this yet.
 */
interface Float16Array {
  readonly buffer: ArrayBuffer;
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly length: number;
  readonly BYTES_PER_ELEMENT: number;
  readonly [Symbol.toStringTag]: "Float16Array";
  [index: number]: number;
  copyWithin(target: number, start: number, end?: number): this;
  every(predicate: (value: number, index: number, array: Float16Array) => boolean): boolean;
  fill(value: number, start?: number, end?: number): this;
  filter(predicate: (value: number, index: number, array: Float16Array) => boolean): Float16Array;
  find(predicate: (value: number, index: number, array: Float16Array) => boolean): number | undefined;
  findIndex(predicate: (value: number, index: number, array: Float16Array) => boolean): number;
  forEach(callbackfn: (value: number, index: number, array: Float16Array) => void): void;
  includes(searchElement: number, fromIndex?: number): boolean;
  indexOf(searchElement: number, fromIndex?: number): number;
  join(separator?: string): string;
  lastIndexOf(searchElement: number, fromIndex?: number): number;
  map(callbackfn: (value: number, index: number, array: Float16Array) => number): Float16Array;
  reduce<T>(callbackfn: (previousValue: T, currentValue: number, currentIndex: number, array: Float16Array) => T, initialValue: T): T;
  reduceRight<T>(callbackfn: (previousValue: T, currentValue: number, currentIndex: number, array: Float16Array) => T, initialValue: T): T;
  reverse(): Float16Array;
  set(array: ArrayLike<number>, offset?: number): void;
  slice(start?: number, end?: number): Float16Array;
  some(predicate: (value: number, index: number, array: Float16Array) => boolean): boolean;
  sort(compareFn?: (a: number, b: number) => number): this;
  subarray(begin?: number, end?: number): Float16Array;
  toLocaleString(): string;
  toString(): string;
  values(): IterableIterator<number>;
  entries(): IterableIterator<[number, number]>;
  keys(): IterableIterator<number>;
  [Symbol.iterator](): IterableIterator<number>;
}

interface Float16ArrayConstructor {
  readonly prototype: Float16Array;
  readonly BYTES_PER_ELEMENT: number;
  new(length: number): Float16Array;
  new(array: ArrayLike<number> | Iterable<number>): Float16Array;
  new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): Float16Array;
  from(arrayLike: ArrayLike<number>): Float16Array;
  from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number): Float16Array;
  of(...items: number[]): Float16Array;
}

declare var Float16Array: Float16ArrayConstructor;

/**
 * Type alias for all supported TypedArray types including Float16Array.
 */
type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float16Array
  | Float32Array
  | Float64Array;

/**
 * Type alias for TypedArray constructors.
 */
type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor
  | Float16ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

/**
 * Primitive type information for Futhark values.
 */
interface PrimInfo {
  tag: string;
  size: number;
  scalar_type: NumberConstructor | BigIntConstructor | BooleanConstructor;
  array_type: TypedArrayConstructor;
  get_heap: (m: EmscriptenModule) => TypedArray;
  create_array: (heap: ArrayBufferLike, byteOffset?: number, length?: number) => TypedArray;
}

/**
 * Manifest type information.
 */
interface ManifestTypeInfo {
  kind: 'array' | 'opaque';
  rank: number;
  elemtype: string;
  ops: {
    new: string;
    free: string;
    shape: string;
    values: string;
  };
}

/**
 * Manifest entry point input/output info.
 */
interface ManifestEntryIO {
  type: string;
  unique: boolean;
}

/**
 * Manifest entry point info.
 */
interface ManifestEntryPoint {
  cfun: string;
  inputs: ManifestEntryIO[];
  outputs: ManifestEntryIO[];
}

/**
 * Futhark program manifest.
 */
interface FutharkManifest {
  backend: string;
  version: string;
  types: Record<string, ManifestTypeInfo>;
  entry_points: Record<string, ManifestEntryPoint>;
}

/**
 * Type alias for scalar values.
 */
type FutharkScalar = number | bigint | boolean;

/**
 * Type alias for array data with shape.
 */
type FutharkArrayData = [TypedArray, bigint[]];

/**
 * Type alias for any Futhark value.
 */
type FutharkValue = FutharkScalar | FutharkArrayData;

/**
 * Interface for Futhark array type classes.
 */
interface FutharkArrayClass {
  from_native(arr: number): FutharkArray;
  from_data(data: number[] | TypedArray, ...shape: (number | bigint)[]): FutharkArray;
}

/**
 * Extended Emscripten module interface with Futhark-specific functions.
 */
interface FutharkEmscriptenModule extends EmscriptenModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  ccall(
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: (number | bigint)[],
    opts?: { async?: boolean }
  ): Promise<number> | number;
  [key: string]: unknown;
}

/**
 * Futhark module wrapper providing access to entry points and array types.
 */
interface FutharkModule {
  m: FutharkEmscriptenModule;
  ctx: number;
  manifest: FutharkManifest;
  types: Record<string, FutharkArrayClass>;
  entry: Record<string, (...args: (FutharkScalar | FutharkArray)[]) => Promise<(FutharkScalar | FutharkArray)[]>>;
  available_entry_points: Record<string, boolean>;
  malloc(size: number): number;
  free(ptr: number): void;
  context_sync(): Promise<void>;
  clear_caches(): Promise<void>;
  report(): Promise<string>;
  pause_profiling(): Promise<void>;
  unpause_profiling(): Promise<void>;
}
