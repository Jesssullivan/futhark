// Start of wrappers.js

// All of the functionality is in subclasses for the individual array types,
// which are generated into fields of the FutharkModule class
// (e.g. `fut.i32_1d` if `fut` is the FutharkModule instance).
// This is just used as a marker so we can check if some object is an instance
// of any of those generated classes.
/**
 * Base class for Futhark array types.
 * Serves as a marker class for instanceof checks across generated array classes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FutharkArray {
  /** Type name for debugging (e.g., "[]i32") */
  type_name: string;
  /** Native WASM pointer to the array, undefined after free */
  arr: number | undefined;
  /** Array dimensions */
  shape: BigInt64Array;

  /**
   * Creates a new FutharkArray.
   * @param name - Type name for debugging (e.g., "[]i32")
   * @param arr - Native WASM pointer to the array
   * @param shape - Array dimensions
   */
  constructor(name: string, arr: number, shape: BigInt64Array) {
    // Name is only for debugging since the debugger will show
    // 'FutharkArrayImpl' as type for all array types.
    this.type_name = name;
    this.arr = arr;
    this.shape = shape;
  }

  /**
   * Gets the shape of this array.
   * @returns The array dimensions
   */
  get_shape(): BigInt64Array { return this.shape; }

  /**
   * Retrieves the array values from WASM memory.
   * Must be implemented by subclass.
   */
  async values(): Promise<TypedArray> {
    throw new Error("values() must be implemented by subclass");
  }

  /**
   * Frees the native WASM memory for this array.
   * Must be implemented by subclass.
   */
  free(): void {
    throw new Error("free() must be implemented by subclass");
  }
}

/**
 * Creates a FutharkArray subclass for a specific array type.
 * @param fut - The Futhark module instance
 * @param name - The type name from the manifest (e.g., "[]i32")
 * @returns A class constructor for arrays of this type
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function make_array_class(fut: FutharkModule, name: string): FutharkArrayClass {
  const type_info = fut.manifest.types[name];
  if (!type_info) {
    throw new FutharkError(
      `Unknown array type: '${name}'`,
      { operation: 'make_array_class', type: name, availableTypes: Object.keys(fut.manifest.types) }
    );
  }
  const prim_info = primInfos[type_info.elemtype];
  if (!prim_info) {
    throw new FutharkError(
      `Unknown element type: '${type_info.elemtype}' for array type '${name}'`,
      { operation: 'make_array_class', type: name, elemType: type_info.elemtype, supportedTypes: Object.keys(primInfos) }
    );
  }

  /**
   * Gets a WASM function by its full name.
   * @param full_name - Function name without underscore prefix
   * @returns The WASM function
   */
  function wasm_fun(full_name: string): (...args: unknown[]) => unknown {
    const wasm_name = "_" + full_name;
    return fut.m[wasm_name] as (...args: unknown[]) => unknown;
  }

  /**
   * Implementation class for a specific Futhark array type.
   */
  return class FutharkArrayImpl extends FutharkArray {
    /**
     * Creates a new FutharkArrayImpl.
     * @param arr - Native WASM pointer to the array
     * @param shape - Array dimensions
     */
    constructor(arr: number, shape: BigInt64Array) {
      super(name, arr, shape);
    }

    /**
     * Creates a FutharkArray from a native WASM array pointer.
     * @param arr - Native WASM pointer to the array
     * @returns The wrapped array
     */
    static from_native(arr: number): FutharkArrayImpl {
      const shape_fun = wasm_fun(type_info.ops.shape) as (ctx: number, arr: number) => number;
      const shape_ptr = shape_fun(fut.ctx, arr);

      const shape = new BigInt64Array(
        fut.m.HEAP64.subarray(shape_ptr / 8, shape_ptr / 8 + type_info.rank));

      return new FutharkArrayImpl(arr, shape);
    }

    /**
     * Creates a FutharkArray from JavaScript data and shape.
     * @param data - The array data (flat)
     * @param shape - The array dimensions
     * @returns The new Futhark array
     * @throws FutharkError if shape length doesn't match type rank or data type is wrong
     */
    static from_data(data: number[] | TypedArray, ...shape: (number | bigint)[]): FutharkArrayImpl {
      futhark_assert(
        shape.length === type_info.rank,
        `Wrong number of shape arguments: expected ${type_info.rank}, got ${shape.length}`,
        { operation: 'from_data', type: name, expectedRank: type_info.rank, gotRank: shape.length }
      );

      let bigIntShape: BigInt64Array;
      if (shape.length === 0) {
        bigIntShape = new BigInt64Array(0);
      } else {
        const firstElem = shape[0];
        if (typeof firstElem === 'number') {
          bigIntShape = BigInt64Array.from(shape.map((x) => BigInt(x)));
        } else {
          bigIntShape = BigInt64Array.from(shape as bigint[]);
        }
      }

      // Validate shape dimensions are non-negative
      for (let i = 0; i < bigIntShape.length; i++) {
        const dim = bigIntShape[i];
        if (dim === undefined) {
          throw new FutharkError(
            `Shape dimension ${i} is undefined`,
            { operation: 'from_data', type: name, dimension: i }
          );
        }
        futhark_assert(
          dim >= 0n,
          `Shape dimension ${i} cannot be negative: ${dim}`,
          { operation: 'from_data', type: name, dimension: i, value: Number(dim) }
        );
      }

      let typedData: TypedArray;
      if (data instanceof Array) {
        typedData = prim_info.create_array(data as unknown as ArrayBufferLike) as TypedArray;
      } else {
        typedData = data;
      }

      futhark_assert(
        typedData instanceof prim_info.array_type,
        `Expected Array or ${prim_info.array_type.name}, got ${typedData.constructor.name}`,
        { operation: 'from_data', type: name, expectedType: prim_info.array_type.name, gotType: typedData.constructor.name }
      );

      // Validate data length matches shape
      const expectedLen = bigIntShape.length === 0 ? 1 : Number(bigIntShape.reduce((a, b) => a * b, 1n));
      futhark_assert(
        typedData.length === expectedLen,
        `Data length ${typedData.length} does not match shape ${Array.from(bigIntShape).join('x')} (expected ${expectedLen} elements)`,
        { operation: 'from_data', type: name, dataLength: typedData.length, expectedLength: expectedLen, shape: Array.from(bigIntShape).map(Number) }
      );

      const wasm_data = fut.malloc(typedData.byteLength);
      const wasm_view = fut.m.HEAPU8.subarray(wasm_data, wasm_data + typedData.byteLength);
      wasm_view.set(new Uint8Array(typedData.buffer, typedData.byteOffset, typedData.byteLength));

      const new_fun = wasm_fun(type_info.ops.new) as (ctx: number, data: number, ...shape: bigint[]) => number;
      const arr = new_fun(fut.ctx, wasm_data, ...bigIntShape);

      fut.free(wasm_data);

      return new FutharkArrayImpl(arr, bigIntShape);
    }

    /**
     * Retrieves the array values from WASM memory.
     * @returns The flat array data
     * @throws FutharkError if the array has already been freed
     */
    override async values(): Promise<TypedArray> {
      if (this.arr === undefined) {
        throw new FutharkError(
          'Cannot get values: array has already been freed',
          { operation: 'values', type: name, shape: Array.from(this.shape).map(Number) }
        );
      }

      const flat_len = Number(this.shape.reduce((a, b) => a * b, 1n));
      const flat_size = flat_len * prim_info.size;
      const wasm_data = fut.malloc(flat_size);

      try {
        await fut.m.ccall(type_info.ops.values,
          'number', ['number', 'number', 'number'],
          [fut.ctx, this.arr, wasm_data],
          {async: true});

        const heap = prim_info.get_heap(fut.m);
        const data = prim_info.create_array(
          heap.subarray(wasm_data / prim_info.size,
                        wasm_data / prim_info.size + flat_len).buffer
        );

        return data;
      } catch (err) {
        throw new FutharkError(
          `Failed to retrieve array values: ${err instanceof Error ? err.message : String(err)}`,
          { operation: 'values', type: name, shape: Array.from(this.shape).map(Number), originalError: String(err) }
        );
      } finally {
        fut.free(wasm_data);
      }
    }

    /**
     * Frees the native WASM memory for this array.
     * After calling this, the array can no longer be used.
     * @throws FutharkError if the array has already been freed
     */
    override free(): void {
      if (this.arr === undefined) {
        throw new FutharkError(
          'Cannot free: array has already been freed',
          { operation: 'free', type: name }
        );
      }
      const free_fun = wasm_fun(type_info.ops.free) as (ctx: number, arr: number) => void;
      free_fun(fut.ctx, this.arr);
      this.arr = undefined;
    }
  };
}

/**
 * Creates a JavaScript wrapper function for a Futhark entry point.
 * @param fut - The Futhark module instance
 * @param name - The entry point name
 * @returns Async function that calls the entry point
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function make_entry_function(
  fut: FutharkModule,
  name: string
): (...inputs: (FutharkScalar | FutharkArray)[]) => Promise<(FutharkScalar | FutharkArray)[]> {
  const entry_info = fut.manifest.entry_points[name];
  if (!entry_info) {
    throw new FutharkError(
      `Unknown entry point: '${name}'`,
      { operation: 'make_entry_function', entryPoint: name, availableEntryPoints: Object.keys(fut.manifest.entry_points) }
    );
  }

  /**
   * Calls the Futhark entry point with the given inputs.
   * @param inputs - Entry point arguments
   * @returns Output values
   * @throws FutharkError if input count doesn't match, types are wrong, or the call fails
   */
  return async function(...inputs: (FutharkScalar | FutharkArray)[]): Promise<(FutharkScalar | FutharkArray)[]> {
    // Validate input count
    if (inputs.length !== entry_info.inputs.length) {
      const expectedTypes = entry_info.inputs.map(i => i.type).join(', ');
      throw new FutharkError(
        `Entry point '${name}' expects ${entry_info.inputs.length} argument(s), got ${inputs.length}`,
        { operation: 'call', entryPoint: name, expectedCount: entry_info.inputs.length, gotCount: inputs.length, expectedTypes }
      );
    }

    const real_inputs: (number | bigint)[] = [];

    // Validate and convert inputs
    for (let i = 0; i < inputs.length; i++) {
      const inputInfo = entry_info.inputs[i];
      const input = inputs[i];
      if (!inputInfo || input === undefined) {
        throw new FutharkError(
          `Entry point '${name}' argument ${i} is missing`,
          { operation: 'call', entryPoint: name, argIndex: i }
        );
      }
      const typ = inputInfo.type;

      if (typ in primInfos) {
        // Scalar type - validate and convert
        if (input instanceof FutharkArray) {
          throw new FutharkError(
            `Entry point '${name}' argument ${i} expects scalar type '${typ}', got FutharkArray`,
            { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: 'FutharkArray' }
          );
        }
        const prim = primInfos[typ];
        if (!prim) {
          throw new FutharkError(
            `Entry point '${name}' argument ${i}: unknown primitive type '${typ}'`,
            { operation: 'call', entryPoint: name, argIndex: i, unknownType: typ }
          );
        }
        const converted = prim.scalar_type(input as number | bigint);
        real_inputs.push(converted as number | bigint);
      }
      else if (typ in fut.manifest.types) {
        const type_info = fut.manifest.types[typ];
        if (!type_info) {
          throw new FutharkError(
            `Entry point '${name}' argument ${i}: type '${typ}' not found in manifest`,
            { operation: 'call', entryPoint: name, argIndex: i, unknownType: typ }
          );
        }
        if (type_info.kind === "array") {
          // Array type - validate
          if (!(input instanceof FutharkArray)) {
            throw new FutharkError(
              `Entry point '${name}' argument ${i} expects array type '${typ}', got ${typeof input}`,
              { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: typeof input }
            );
          }
          const arr = input as FutharkArray;
          if (arr.arr === undefined) {
            throw new FutharkError(
              `Entry point '${name}' argument ${i}: array has already been freed`,
              { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ }
            );
          }
          // Validate array type matches expected type
          if (arr.type_name !== typ) {
            throw new FutharkError(
              `Entry point '${name}' argument ${i} expects type '${typ}', got '${arr.type_name}'`,
              { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: arr.type_name }
            );
          }
          real_inputs.push(arr.arr);
        }
        else {
          // Opaque type
          real_inputs.push(input as number);
        }
      }
      else {
        throw new FutharkError(
          `Entry point '${name}' argument ${i}: unknown type '${typ}'`,
          { operation: 'call', entryPoint: name, argIndex: i, unknownType: typ }
        );
      }
    }

    const out_ptrs: number[] = [];
    for (let i = 0; i < entry_info.outputs.length; i++) {
      out_ptrs.push(fut.malloc(4));
    }

    try {
      const ccall_args: (number | bigint)[] = [fut.ctx, ...out_ptrs, ...real_inputs];
      await fut.m.ccall(entry_info.cfun, 'number',
        Array(1 + out_ptrs.length + real_inputs.length).fill('number'),
        ccall_args, {async: true});
    } catch (err) {
      // Clean up output pointers before re-throwing
      for (const ptr of out_ptrs) {
        fut.free(ptr);
      }
      throw new FutharkError(
        `Entry point '${name}' call failed: ${err instanceof Error ? err.message : String(err)}`,
        { operation: 'call', entryPoint: name, originalError: String(err) }
      );
    }

    const outputs: (FutharkScalar | FutharkArray)[] = [];
    for (let i = 0; i < out_ptrs.length; i++) {
      const out_info = entry_info.outputs[i];
      const out_ptr = out_ptrs[i];
      if (!out_info || out_ptr === undefined) {
        throw new FutharkError(
          `Entry point '${name}' output ${i} is missing`,
          { operation: 'call', entryPoint: name, outputIndex: i }
        );
      }
      if (out_info.type in primInfos) {
        const prim_info = primInfos[out_info.type];
        if (!prim_info) {
          throw new FutharkError(
            `Entry point '${name}' output ${i}: unknown primitive type '${out_info.type}'`,
            { operation: 'call', entryPoint: name, outputIndex: i, unknownType: out_info.type }
          );
        }
        const heap = prim_info.get_heap(fut.m);
        const heapIndex = out_ptr / prim_info.size;
        const val = heap[heapIndex];
        if (val === undefined) {
          throw new FutharkError(
            `Entry point '${name}' output ${i}: failed to read value from heap`,
            { operation: 'call', entryPoint: name, outputIndex: i, heapIndex }
          );
        }
        outputs.push(val as FutharkScalar);
      }
      else if (out_info.type in fut.manifest.types) {
        const type_info = fut.manifest.types[out_info.type];
        if (!type_info) {
          throw new FutharkError(
            `Entry point '${name}' output ${i}: type '${out_info.type}' not found in manifest`,
            { operation: 'call', entryPoint: name, outputIndex: i, unknownType: out_info.type }
          );
        }
        if (type_info.kind === "array") {
          const array_type = fut.types[out_info.type];
          if (!array_type) {
            throw new FutharkError(
              `Entry point '${name}' output ${i}: array type class '${out_info.type}' not found`,
              { operation: 'call', entryPoint: name, outputIndex: i, unknownType: out_info.type }
            );
          }
          const heapIndex = out_ptr / 4;
          const nativePtr = fut.m.HEAP32[heapIndex];
          if (nativePtr === undefined) {
            throw new FutharkError(
              `Entry point '${name}' output ${i}: failed to read native pointer from heap`,
              { operation: 'call', entryPoint: name, outputIndex: i, heapIndex }
            );
          }
          const val = array_type.from_native(nativePtr);
          outputs.push(val);
        }
        else {
          // Opaque type - return raw value
          const heapIndex = out_ptr / 4;
          const val = fut.m.HEAP32[heapIndex];
          if (val === undefined) {
            throw new FutharkError(
              `Entry point '${name}' output ${i}: failed to read opaque value from heap`,
              { operation: 'call', entryPoint: name, outputIndex: i, heapIndex }
            );
          }
          outputs.push(val as number);
        }
      }
      else {
        throw new FutharkError(
          `Entry point '${name}' output ${i}: unknown type '${out_info.type}'`,
          { operation: 'call', entryPoint: name, outputIndex: i, unknownType: out_info.type }
        );
      }
    }

    for (const ptr of out_ptrs) {
      fut.free(ptr);
    }

    return outputs;
  };
}

// End of wrappers.js
