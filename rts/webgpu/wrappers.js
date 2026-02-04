"use strict";
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
    type_name;
    /** Native WASM pointer to the array, undefined after free */
    arr;
    /** Array dimensions */
    shape;
    /**
     * Creates a new FutharkArray.
     * @param name - Type name for debugging (e.g., "[]i32")
     * @param arr - Native WASM pointer to the array
     * @param shape - Array dimensions
     */
    constructor(name, arr, shape) {
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
    get_shape() { return this.shape; }
    /**
     * Retrieves the array values from WASM memory.
     * Must be implemented by subclass.
     */
    async values() {
        throw new Error("values() must be implemented by subclass");
    }
    /**
     * Frees the native WASM memory for this array.
     * Must be implemented by subclass.
     */
    free() {
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
function make_array_class(fut, name) {
    const type_info = fut.manifest.types[name];
    const prim_info = primInfos[type_info.elemtype];
    /**
     * Gets a WASM function by its full name.
     * @param full_name - Function name without underscore prefix
     * @returns The WASM function
     */
    function wasm_fun(full_name) {
        const wasm_name = "_" + full_name;
        return fut.m[wasm_name];
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
        constructor(arr, shape) {
            super(name, arr, shape);
        }
        /**
         * Creates a FutharkArray from a native WASM array pointer.
         * @param arr - Native WASM pointer to the array
         * @returns The wrapped array
         */
        static from_native(arr) {
            const shape_fun = wasm_fun(type_info.ops.shape);
            const shape_ptr = shape_fun(fut.ctx, arr);
            const shape = new BigInt64Array(fut.m.HEAP64.subarray(shape_ptr / 8, shape_ptr / 8 + type_info.rank));
            return new FutharkArrayImpl(arr, shape);
        }
        /**
         * Creates a FutharkArray from JavaScript data and shape.
         * @param data - The array data (flat)
         * @param shape - The array dimensions
         * @returns The new Futhark array
         * @throws FutharkError if shape length doesn't match type rank or data type is wrong
         */
        static from_data(data, ...shape) {
            futhark_assert(shape.length === type_info.rank, `Wrong number of shape arguments: expected ${type_info.rank}, got ${shape.length}`, { operation: 'from_data', type: name, expectedRank: type_info.rank, gotRank: shape.length });
            let bigIntShape;
            if (shape.length === 0) {
                bigIntShape = new BigInt64Array(0);
            }
            else if (typeof (shape[0]) === 'number') {
                bigIntShape = BigInt64Array.from(shape.map((x) => BigInt(x)));
            }
            else {
                bigIntShape = BigInt64Array.from(shape);
            }
            // Validate shape dimensions are non-negative
            for (let i = 0; i < bigIntShape.length; i++) {
                futhark_assert(bigIntShape[i] >= 0n, `Shape dimension ${i} cannot be negative: ${bigIntShape[i]}`, { operation: 'from_data', type: name, dimension: i, value: Number(bigIntShape[i]) });
            }
            let typedData;
            if (data instanceof Array) {
                typedData = prim_info.create_array(data);
            }
            else {
                typedData = data;
            }
            futhark_assert(typedData instanceof prim_info.array_type, `Expected Array or ${prim_info.array_type.name}, got ${typedData.constructor.name}`, { operation: 'from_data', type: name, expectedType: prim_info.array_type.name, gotType: typedData.constructor.name });
            // Validate data length matches shape
            const expectedLen = bigIntShape.length === 0 ? 1 : Number(bigIntShape.reduce((a, b) => a * b, 1n));
            futhark_assert(typedData.length === expectedLen, `Data length ${typedData.length} does not match shape ${Array.from(bigIntShape).join('x')} (expected ${expectedLen} elements)`, { operation: 'from_data', type: name, dataLength: typedData.length, expectedLength: expectedLen, shape: Array.from(bigIntShape).map(Number) });
            const wasm_data = fut.malloc(typedData.byteLength);
            const wasm_view = fut.m.HEAPU8.subarray(wasm_data, wasm_data + typedData.byteLength);
            wasm_view.set(new Uint8Array(typedData.buffer, typedData.byteOffset, typedData.byteLength));
            const new_fun = wasm_fun(type_info.ops.new);
            const arr = new_fun(fut.ctx, wasm_data, ...bigIntShape);
            fut.free(wasm_data);
            return new FutharkArrayImpl(arr, bigIntShape);
        }
        /**
         * Retrieves the array values from WASM memory.
         * @returns The flat array data
         * @throws FutharkError if the array has already been freed
         */
        async values() {
            if (this.arr === undefined) {
                throw new FutharkError('Cannot get values: array has already been freed', { operation: 'values', type: name, shape: Array.from(this.shape).map(Number) });
            }
            const flat_len = Number(this.shape.reduce((a, b) => a * b, 1n));
            const flat_size = flat_len * prim_info.size;
            const wasm_data = fut.malloc(flat_size);
            try {
                await fut.m.ccall(type_info.ops.values, 'number', ['number', 'number', 'number'], [fut.ctx, this.arr, wasm_data], { async: true });
                const heap = prim_info.get_heap(fut.m);
                const data = prim_info.create_array(heap.subarray(wasm_data / prim_info.size, wasm_data / prim_info.size + flat_len).buffer);
                return data;
            }
            catch (err) {
                throw new FutharkError(`Failed to retrieve array values: ${err instanceof Error ? err.message : String(err)}`, { operation: 'values', type: name, shape: Array.from(this.shape).map(Number), originalError: String(err) });
            }
            finally {
                fut.free(wasm_data);
            }
        }
        /**
         * Frees the native WASM memory for this array.
         * After calling this, the array can no longer be used.
         * @throws FutharkError if the array has already been freed
         */
        free() {
            if (this.arr === undefined) {
                throw new FutharkError('Cannot free: array has already been freed', { operation: 'free', type: name });
            }
            const free_fun = wasm_fun(type_info.ops.free);
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
function make_entry_function(fut, name) {
    const entry_info = fut.manifest.entry_points[name];
    /**
     * Calls the Futhark entry point with the given inputs.
     * @param inputs - Entry point arguments
     * @returns Output values
     * @throws FutharkError if input count doesn't match, types are wrong, or the call fails
     */
    return async function (...inputs) {
        // Validate input count
        if (inputs.length !== entry_info.inputs.length) {
            const expectedTypes = entry_info.inputs.map(i => i.type).join(', ');
            throw new FutharkError(`Entry point '${name}' expects ${entry_info.inputs.length} argument(s), got ${inputs.length}`, { operation: 'call', entryPoint: name, expectedCount: entry_info.inputs.length, gotCount: inputs.length, expectedTypes });
        }
        const real_inputs = [];
        // Validate and convert inputs
        for (let i = 0; i < inputs.length; i++) {
            const typ = entry_info.inputs[i].type;
            const input = inputs[i];
            if (typ in primInfos) {
                // Scalar type - validate and convert
                if (input instanceof FutharkArray) {
                    throw new FutharkError(`Entry point '${name}' argument ${i} expects scalar type '${typ}', got FutharkArray`, { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: 'FutharkArray' });
                }
                const converted = primInfos[typ].scalar_type(input);
                real_inputs.push(converted);
            }
            else if (typ in fut.manifest.types) {
                const type_info = fut.manifest.types[typ];
                if (type_info.kind === "array") {
                    // Array type - validate
                    if (!(input instanceof FutharkArray)) {
                        throw new FutharkError(`Entry point '${name}' argument ${i} expects array type '${typ}', got ${typeof input}`, { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: typeof input });
                    }
                    const arr = input;
                    if (arr.arr === undefined) {
                        throw new FutharkError(`Entry point '${name}' argument ${i}: array has already been freed`, { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ });
                    }
                    // Validate array type matches expected type
                    if (arr.type_name !== typ) {
                        throw new FutharkError(`Entry point '${name}' argument ${i} expects type '${typ}', got '${arr.type_name}'`, { operation: 'call', entryPoint: name, argIndex: i, expectedType: typ, gotType: arr.type_name });
                    }
                    real_inputs.push(arr.arr);
                }
                else {
                    // Opaque type
                    real_inputs.push(input);
                }
            }
            else {
                throw new FutharkError(`Entry point '${name}' argument ${i}: unknown type '${typ}'`, { operation: 'call', entryPoint: name, argIndex: i, unknownType: typ });
            }
        }
        const out_ptrs = [];
        for (let i = 0; i < entry_info.outputs.length; i++) {
            out_ptrs.push(fut.malloc(4));
        }
        try {
            const ccall_args = [fut.ctx, ...out_ptrs, ...real_inputs];
            await fut.m.ccall(entry_info.cfun, 'number', Array(1 + out_ptrs.length + real_inputs.length).fill('number'), ccall_args, { async: true });
        }
        catch (err) {
            // Clean up output pointers before re-throwing
            for (const ptr of out_ptrs) {
                fut.free(ptr);
            }
            throw new FutharkError(`Entry point '${name}' call failed: ${err instanceof Error ? err.message : String(err)}`, { operation: 'call', entryPoint: name, originalError: String(err) });
        }
        const outputs = [];
        for (let i = 0; i < out_ptrs.length; i++) {
            const out_info = entry_info.outputs[i];
            if (out_info.type in primInfos) {
                const prim_info = primInfos[out_info.type];
                const heap = prim_info.get_heap(fut.m);
                const val = heap[out_ptrs[i] / prim_info.size];
                outputs.push(val);
            }
            else if (out_info.type in fut.manifest.types) {
                const type_info = fut.manifest.types[out_info.type];
                if (type_info.kind === "array") {
                    const array_type = fut.types[out_info.type];
                    const val = array_type.from_native(fut.m.HEAP32[out_ptrs[i] / 4]);
                    outputs.push(val);
                }
                else {
                    // Opaque type - return raw value
                    outputs.push(fut.m.HEAP32[out_ptrs[i] / 4]);
                }
            }
            else {
                throw new FutharkError(`Entry point '${name}' output ${i}: unknown type '${out_info.type}'`, { operation: 'call', entryPoint: name, outputIndex: i, unknownType: out_info.type });
            }
        }
        for (const ptr of out_ptrs) {
            fut.free(ptr);
        }
        return outputs;
    };
}
// End of wrappers.js
//# sourceMappingURL=wrappers.js.map