"use strict";
// Start of values.js
/**
 * Version of the Futhark binary format supported by this reader/writer.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const futhark_binary_format_version = 2;
/**
 * Reader for Futhark binary format data.
 * Parses binary-encoded values according to the Futhark data format specification.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FutharkReader {
    /** The binary buffer being read */
    buf;
    /**
     * Creates a new FutharkReader.
     * @param buf - Binary data to read
     */
    constructor(buf) {
        futhark_assert(buf instanceof Uint8Array);
        this.buf = buf;
    }
    /**
     * Advances the read position by n bytes.
     * @param n - Number of bytes to skip
     */
    seek(n) {
        this.buf = this.buf.subarray(n);
    }
    /**
     * Reads a single byte and advances the position.
     * @returns The byte value (0-255)
     */
    read_byte() {
        const b = this.buf[0];
        this.seek(1);
        return b;
    }
    /**
     * Reads a 64-bit signed integer (little-endian) and advances the position.
     * @returns The 64-bit integer value
     */
    read_i64() {
        const buf = new Uint8Array(this.buf.subarray(0, 8));
        const val = new BigInt64Array(buf.buffer, 0, 1)[0];
        this.seek(8);
        return val;
    }
    /**
     * Reads a complete Futhark value from the binary stream.
     * @param expected_type - Optional expected type string for validation (e.g., "i32" or "[][]f64")
     * @returns Scalar value, or tuple of [data, shape] for arrays
     * @throws FutharkError if the binary format is invalid or type doesn't match expected
     */
    read_value(expected_type) {
        // Check for sufficient data
        if (this.buf.length === 0) {
            throw new FutharkError('Cannot read value: buffer is empty', { operation: 'read_value', expectedType: expected_type });
        }
        let off = 0;
        while (off < this.buf.length && this.is_whitespace(this.buf[off]))
            off++;
        this.seek(off);
        // Validate minimum header size (1 magic + 1 version + 1 rank + 4 type = 7 bytes)
        if (this.buf.length < 7) {
            throw new FutharkError(`Invalid binary data: expected at least 7 bytes for header, got ${this.buf.length}`, { operation: 'read_value', bufferLength: this.buf.length, expectedType: expected_type });
        }
        const magic = this.read_byte();
        if (magic !== this.byte_val('b')) {
            throw new FutharkError(`Invalid binary format: expected magic byte 'b' (0x62), got 0x${magic.toString(16)}`, { operation: 'read_value', gotMagic: magic, expectedType: expected_type });
        }
        const version = this.read_byte();
        if (version !== futhark_binary_format_version) {
            throw new FutharkError(`Unsupported binary format version: expected ${futhark_binary_format_version}, got ${version}`, { operation: 'read_value', gotVersion: version, supportedVersion: futhark_binary_format_version, expectedType: expected_type });
        }
        const rank = this.read_byte();
        const type = String.fromCodePoint(...this.buf.slice(0, 4)).trimStart();
        if (!(type in primInfos)) {
            throw new FutharkError(`Unknown primitive type in binary data: '${type}'`, { operation: 'read_value', unknownType: type, expectedType: expected_type, supportedTypes: Object.keys(primInfos) });
        }
        this.seek(4);
        if (expected_type !== undefined) {
            if (rank === 0 && expected_type !== type) {
                throw new FutharkError(`Type mismatch: read scalar type '${type}', expected '${expected_type}'`, { operation: 'read_value', readType: type, expectedType: expected_type, readRank: rank });
            }
            if (rank > 0) {
                let expected_rank = 0;
                let rem_type = expected_type;
                while (rem_type.startsWith("[]")) {
                    expected_rank++;
                    rem_type = rem_type.slice(2);
                }
                if (rank !== expected_rank || type !== rem_type) {
                    const readTypeStr = "[]".repeat(rank) + type;
                    throw new FutharkError(`Type mismatch: read '${readTypeStr}', expected '${expected_type}'`, { operation: 'read_value', readType: readTypeStr, expectedType: expected_type, readRank: rank, expectedRank: expected_rank });
                }
            }
        }
        // Validate sufficient data for shape
        const shapeBytes = rank * 8;
        if (this.buf.length < shapeBytes) {
            throw new FutharkError(`Truncated binary data: expected ${shapeBytes} bytes for shape (rank ${rank}), got ${this.buf.length}`, { operation: 'read_value', expectedBytes: shapeBytes, availableBytes: this.buf.length, rank });
        }
        const shape = [];
        for (let i = 0; i < rank; i++) {
            shape.push(this.read_i64());
        }
        if (rank === 0) {
            const [val] = this.read_array(type, [1n]);
            return val[0];
        }
        else {
            return this.read_array(type, shape);
        }
    }
    /**
     * Reads an array of values from the binary stream.
     * @param type - The element type (e.g., "i32", "f64")
     * @param shape - Array dimensions as BigInts
     * @returns Tuple of [flat data array, shape]
     * @throws FutharkError if there is insufficient data in the buffer
     */
    read_array(type, shape) {
        const type_info = primInfos[type];
        const flat_len = shape.length === 0 ? 1 : Number(shape.reduce((a, b) => a * b, 1n));
        const required_bytes = flat_len * type_info.size;
        // Validate sufficient data for array contents
        if (this.buf.length < required_bytes) {
            throw new FutharkError(`Truncated binary data: expected ${required_bytes} bytes for array data, got ${this.buf.length}`, { operation: 'read_array', type, shape: shape.map(Number), expectedBytes: required_bytes, availableBytes: this.buf.length });
        }
        const buf = new Uint8Array(this.buf.subarray(0, flat_len * type_info.size));
        const wrapper = new type_info.array_type(buf.buffer, 0, flat_len);
        this.seek(wrapper.byteLength);
        return [wrapper, shape];
    }
    /**
     * Checks if a byte value represents ASCII whitespace.
     * @param b - Byte value to check
     * @returns True if the byte is whitespace
     */
    is_whitespace(b) {
        const whitespace = [' ', '\t', '\n'].map((c) => this.byte_val(c));
        return b in whitespace;
    }
    /**
     * Converts a character to its ASCII byte value.
     * @param c - Single character string
     * @returns ASCII code of the character
     */
    byte_val(c) { return c.charCodeAt(0); }
}
/**
 * Writer for Futhark binary format data.
 * Encodes values according to the Futhark data format specification.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FutharkWriter {
    /**
     * Encodes a value to Futhark binary format.
     * @param val - Value to encode (scalar or [data, shape] for arrays)
     * @param type - Type string (e.g., "i32" or "[][]f64")
     * @returns Binary encoded data
     * @throws FutharkError if the type is unknown or the value doesn't match the type
     */
    encode_value(val, type) {
        let elem_type;
        let rank = 0;
        let flat_len = 0;
        if (type in primInfos) {
            elem_type = type;
            rank = 0;
            flat_len = 1;
            // Validate that val is a scalar
            if (Array.isArray(val) && val.length === 2 && Array.isArray(val[1])) {
                throw new FutharkError(`Type mismatch: expected scalar type '${type}', got array data`, { operation: 'encode_value', expectedType: type, gotType: 'array' });
            }
        }
        else {
            elem_type = type.replaceAll("[]", "");
            if (!(elem_type in primInfos)) {
                throw new FutharkError(`Unknown element type '${elem_type}' in type '${type}'`, { operation: 'encode_value', type, elementType: elem_type, supportedTypes: Object.keys(primInfos) });
            }
            // Validate that val is array data
            if (!Array.isArray(val) || val.length !== 2) {
                throw new FutharkError(`Type mismatch: expected array data [values, shape] for type '${type}', got ${typeof val}`, { operation: 'encode_value', expectedType: type, gotType: typeof val });
            }
            const [, shape] = val;
            rank = shape.length;
            flat_len = shape.length === 0 ? 1 : Number(shape.reduce((a, b) => a * b, 1n));
        }
        const prim_info = primInfos[elem_type];
        const header_size = 3 + 4;
        const total_size = header_size + rank * 8 + flat_len * prim_info.size;
        const buf = new Uint8Array(total_size);
        buf[0] = this.byte_val('b');
        buf[1] = futhark_binary_format_version;
        buf[2] = rank;
        const tag = Uint8Array.from(prim_info.tag, c => c.charCodeAt(0));
        buf.set(tag, 3);
        let offset = header_size;
        let data;
        let shape;
        if (rank === 0) {
            // For scalars, we need to create a single-element array
            const scalarVal = val;
            // Create the array based on the type
            if (prim_info.array_type === BigInt64Array) {
                data = new BigInt64Array([scalarVal]);
            }
            else if (prim_info.array_type === BigUint64Array) {
                data = new BigUint64Array([scalarVal]);
            }
            else if (prim_info.array_type === Float16Array) {
                data = new Float16Array([scalarVal]);
            }
            else if (prim_info.array_type === Float32Array) {
                data = new Float32Array([scalarVal]);
            }
            else if (prim_info.array_type === Float64Array) {
                data = new Float64Array([scalarVal]);
            }
            else if (prim_info.array_type === Int8Array) {
                data = new Int8Array([scalarVal]);
            }
            else if (prim_info.array_type === Uint8Array) {
                data = new Uint8Array([scalarVal]);
            }
            else if (prim_info.array_type === Int16Array) {
                data = new Int16Array([scalarVal]);
            }
            else if (prim_info.array_type === Uint16Array) {
                data = new Uint16Array([scalarVal]);
            }
            else if (prim_info.array_type === Int32Array) {
                data = new Int32Array([scalarVal]);
            }
            else {
                data = new Uint32Array([scalarVal]);
            }
            shape = [];
        }
        else {
            const [d, s] = val;
            data = d;
            shape = s;
        }
        const dims = new BigInt64Array(shape);
        buf.set(new Uint8Array(dims.buffer), offset);
        offset += dims.byteLength;
        const bin_data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        buf.set(bin_data, offset);
        return buf;
    }
    /**
     * Converts a character to its ASCII byte value.
     * @param c - Single character string
     * @returns ASCII code of the character
     */
    byte_val(c) { return c.charCodeAt(0); }
}
// End of values.js
//# sourceMappingURL=values.js.map