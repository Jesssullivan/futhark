"use strict";
// Start of server_ws.js
/**
 * Converts an ArrayBuffer to a base64 string using FileReader.
 * @param buffer - The binary data to encode
 * @returns Base64 encoded string
 * @see https://stackoverflow.com/a/66046176/3112547
 */
async function bufferToBase64(buffer) {
    // Convert Uint8Array to ArrayBuffer if needed for Blob compatibility
    let arrayBuffer;
    if (buffer instanceof Uint8Array) {
        // Create a new ArrayBuffer and copy data to ensure it's not SharedArrayBuffer
        arrayBuffer = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(arrayBuffer).set(buffer);
    }
    else {
        arrayBuffer = buffer;
    }
    const base64url = await new Promise((r) => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result);
        reader.readAsDataURL(new Blob([arrayBuffer]));
    });
    return base64url.slice(base64url.indexOf(',') + 1);
}
/**
 * WebSocket-based server for running Futhark programs in the browser.
 * Used by `futhark test` and `futhark bench` for browser-based testing.
 */
class BrowserServer {
    /** The Futhark module instance */
    fut;
    /** Stored variables by name */
    vars;
    /** Available command handlers */
    commands;
    /** WebSocket connection */
    socket;
    /**
     * Creates a new BrowserServer and connects to the WebSocket endpoint.
     * @param fut - The initialized Futhark module
     * @param _port - Optional port (unused, connects via window.location)
     */
    constructor(fut, _port) {
        this.fut = fut;
        this.vars = {};
        this.commands = {
            'entry_points': this.cmd_entry_points.bind(this),
            'inputs': this.cmd_inputs.bind(this),
            'outputs': this.cmd_outputs.bind(this),
            'restore': this.cmd_restore.bind(this),
            'store': this.cmd_store.bind(this),
            'free': this.cmd_free.bind(this),
            'call': this.cmd_call.bind(this),
            'clear': this.cmd_clear.bind(this),
            'report': this.cmd_report.bind(this),
            'pause_profiling': this.cmd_pause_profiling.bind(this),
            'unpause_profiling': this.cmd_unpause_profiling.bind(this),
        };
        this.socket = new WebSocket("ws://" + window.location.host + "/ws");
        this.socket.onerror = (event) => {
            console.error("WebSocket error:", event);
        };
        this.socket.onclose = (event) => {
            console.log(`WebSocket closed: code=${event.code}, reason=${event.reason || 'none'}`);
        };
        this.socket.onmessage = async (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            }
            catch (parseError) {
                console.error("Failed to parse WebSocket message:", parseError);
                const resp = {
                    status: "fail",
                    text: `Invalid JSON message: ${parseError instanceof Error ? parseError.message : String(parseError)}`
                };
                this.socket.send(JSON.stringify(resp));
                return;
            }
            console.log("WS command:", msg);
            let resp;
            try {
                if (!msg.cmd || typeof msg.cmd !== 'string') {
                    throw new FutharkError('Invalid command message: missing or invalid "cmd" field', { receivedMessage: msg });
                }
                if (!(msg.cmd in this.commands)) {
                    const available = Object.keys(this.commands);
                    throw new FutharkError(`Unknown command: '${msg.cmd}'`, { command: msg.cmd, availableCommands: available });
                }
                const fun = this.commands[msg.cmd];
                if (!fun) {
                    throw new FutharkError(`Command handler not found: '${msg.cmd}'`, { command: msg.cmd, availableCommands: Object.keys(this.commands) });
                }
                const args = Array.isArray(msg.args) ? msg.args : [];
                const res = await fun(...args);
                await this.fut.context_sync();
                if (typeof res === "string") {
                    resp = { status: "ok", text: res };
                }
                else {
                    resp = { status: "ok", ...res };
                }
            }
            catch (ex) {
                console.error("Command execution failed:", ex);
                // Provide detailed error information including context for FutharkError
                let errorText;
                if (ex instanceof FutharkError) {
                    errorText = ex.toString();
                }
                else if (ex instanceof Error) {
                    errorText = `${ex.name}: ${ex.message}`;
                }
                else {
                    errorText = String(ex);
                }
                resp = { status: "fail", text: errorText };
            }
            this.socket.send(JSON.stringify(resp));
        };
        console.log("Created WS client.");
    }
    /**
     * Gets an entry point function by name.
     * @param entry - Entry point name
     * @returns The entry point function
     * @throws FutharkError if entry point not found
     */
    get_entry_point(entry) {
        const entryFn = this.fut.entry[entry];
        if (entryFn) {
            return entryFn;
        }
        const available = Object.keys(this.fut.available_entry_points);
        throw new FutharkError(`Unknown entry point: '${entry}'`, { operation: 'get_entry_point', entryPoint: entry, availableEntryPoints: available });
    }
    /**
     * Gets entry point info from the manifest.
     * @param entry - Entry point name
     * @returns Entry point metadata
     * @throws FutharkError if entry point not found
     */
    get_manifest_entry_point(entry) {
        const entryInfo = this.fut.manifest.entry_points[entry];
        if (entryInfo) {
            return entryInfo;
        }
        const available = Object.keys(this.fut.manifest.entry_points);
        throw new FutharkError(`Unknown entry point: '${entry}'`, { operation: 'get_manifest_entry_point', entryPoint: entry, availableEntryPoints: available });
    }
    /**
     * Gets type info from the manifest.
     * @param type - Type name
     * @returns Type metadata
     * @throws FutharkError if type not found
     */
    get_manifest_type(type) {
        const typeInfo = this.fut.manifest.types[type];
        if (typeInfo) {
            return typeInfo;
        }
        const available = Object.keys(this.fut.manifest.types);
        throw new FutharkError(`Unknown type: '${type}'`, { operation: 'get_manifest_type', type, availableTypes: available });
    }
    /**
     * Checks if a variable exists.
     * @param name - Variable name
     * @throws FutharkError if variable not found
     */
    check_var(name) {
        if (!(name in this.vars)) {
            const available = Object.keys(this.vars);
            throw new FutharkError(`Unknown variable: '${name}'`, { operation: 'check_var', variable: name, availableVariables: available });
        }
    }
    /**
     * Sets a variable value.
     * @param name - Variable name
     * @param val - The value
     * @param typ - The Futhark type string
     */
    set_var(name, val, typ) {
        this.vars[name] = { val: val, typ: typ };
    }
    /**
     * Gets a stored variable.
     * @param name - Variable name
     * @returns The stored variable
     * @throws If variable not found
     */
    get_var(name) {
        this.check_var(name);
        // Safe to use non-null assertion after check_var validation
        return this.vars[name];
    }
    /**
     * Deletes a variable.
     * @param name - Variable name
     */
    delete_var(name) {
        delete this.vars[name];
    }
    /**
     * Lists all available entry points.
     * @returns Newline-separated entry point names
     */
    async cmd_entry_points() {
        const entries = Object.keys(this.fut.available_entry_points);
        return entries.join("\n");
    }
    /**
     * Gets the input types for an entry point.
     * @param entry - Entry point name
     * @returns Newline-separated input types (prefixed with * if unique)
     */
    async cmd_inputs(entry) {
        const entry_info = this.get_manifest_entry_point(entry);
        const inputs = entry_info.inputs.map(function (arg) {
            if (arg.unique) {
                return "*" + arg.type;
            }
            return arg.type;
        });
        return inputs.join("\n");
    }
    /**
     * Gets the output types for an entry point.
     * @param entry - Entry point name
     * @returns Newline-separated output types (prefixed with * if unique)
     */
    async cmd_outputs(entry) {
        const entry_info = this.get_manifest_entry_point(entry);
        const outputs = entry_info.outputs.map(function (arg) {
            if (arg.unique) {
                return "*" + arg.type;
            }
            return arg.type;
        });
        return outputs.join("\n");
    }
    /**
     * Restores variables from a binary file.
     * @param file - URL of the file to fetch
     * @param varsAndTypes - Alternating variable names and types
     * @returns Empty string on success
     * @throws FutharkError if fetch fails, parsing fails, or types don't match
     */
    async cmd_restore(file, ...varsAndTypes) {
        // Validate arguments
        if (!file) {
            throw new FutharkError('restore: file URL is required', { operation: 'restore' });
        }
        if (varsAndTypes.length === 0 || varsAndTypes.length % 2 !== 0) {
            throw new FutharkError(`restore: expected even number of arguments (variable name, type pairs), got ${varsAndTypes.length}`, { operation: 'restore', argumentCount: varsAndTypes.length });
        }
        // Request file from the server.
        let response;
        try {
            response = await fetch(file);
        }
        catch (fetchError) {
            throw new FutharkError(`restore: failed to fetch file '${file}': ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`, { operation: 'restore', file, error: String(fetchError) });
        }
        if (!response.ok) {
            throw new FutharkError(`restore: failed to fetch file '${file}': ${response.status} ${response.statusText}`, { operation: 'restore', file, status: response.status, statusText: response.statusText });
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const reader = new FutharkReader(data);
        for (let i = 0; i < varsAndTypes.length; i += 2) {
            const name = varsAndTypes[i];
            const type = varsAndTypes[i + 1];
            if (!name || !type) {
                throw new FutharkError(`restore: invalid variable/type pair at index ${i}`, { operation: 'restore', index: i, name, type });
            }
            try {
                const raw_val = reader.read_value(type);
                let val;
                if (type in this.fut.manifest.types) {
                    const type_info = this.get_manifest_type(type);
                    futhark_assert(type_info.kind === "array", `restore: type '${type}' is not an array type`, { operation: 'restore', variable: name, type, typeKind: type_info.kind });
                    const [arrData, shape] = raw_val;
                    const typeClass = this.fut.types[type];
                    if (!typeClass) {
                        throw new FutharkError(`restore: array type class not found for type '${type}'`, { operation: 'restore', type, availableTypes: Object.keys(this.fut.types) });
                    }
                    val = typeClass.from_data(arrData, ...shape);
                }
                else {
                    // Scalar.
                    val = raw_val;
                }
                this.set_var(name, val, type);
            }
            catch (readError) {
                throw new FutharkError(`restore: failed to read variable '${name}' of type '${type}': ${readError instanceof Error ? readError.message : String(readError)}`, { operation: 'restore', variable: name, type, error: String(readError) });
            }
        }
        return "";
    }
    /**
     * Stores variables to base64-encoded binary format.
     * @param vars - Variable names to store
     * @returns Base64 data and type list
     */
    async cmd_store(...vars) {
        let data = "";
        const types = [];
        for (const name of vars) {
            const { val, typ } = this.get_var(name);
            let to_write;
            if (typ in this.fut.manifest.types) {
                const type_info = this.get_manifest_type(typ);
                futhark_assert(type_info.kind === "array");
                const values = await val.values();
                const shape = val.get_shape();
                to_write = [values, Array.from(shape)];
            }
            else {
                // Scalar.
                to_write = val;
            }
            const encoded = new FutharkWriter().encode_value(to_write, typ);
            data += await bufferToBase64(encoded);
            types.push(typ);
        }
        return { 'data': data, 'types': types };
    }
    /**
     * Frees a variable and its associated memory.
     * @param name - Variable name
     * @returns Empty string on success
     */
    async cmd_free(name) {
        const { val } = this.get_var(name);
        if (val instanceof FutharkArray) {
            val.free();
        }
        this.delete_var(name);
        return "";
    }
    /**
     * Calls an entry point function.
     * @param entry - Entry point name
     * @param outsAndIns - Output variable names followed by input variable names
     * @returns Runtime in microseconds as "runtime: N"
     */
    async cmd_call(entry, ...outsAndIns) {
        const entry_info = this.get_manifest_entry_point(entry);
        const entry_fun = this.get_entry_point(entry);
        const outCount = entry_info.outputs.length;
        const outNames = outsAndIns.slice(0, outCount);
        const inNames = outsAndIns.slice(outCount, outsAndIns.length);
        const ins = inNames.map((n) => this.get_var(n).val);
        const startTime = performance.now();
        const outs = await entry_fun(...ins);
        await this.fut.context_sync();
        const endTime = performance.now();
        for (let i = 0; i < outNames.length; i++) {
            const outName = outNames[i];
            const outVal = outs[i];
            const outputInfo = entry_info.outputs[i];
            if (!outName || outVal === undefined || !outputInfo) {
                throw new FutharkError(`cmd_call: output index ${i} is out of bounds`, { operation: 'cmd_call', entryPoint: entry, outputIndex: i, outputCount: outNames.length });
            }
            this.set_var(outName, outVal, outputInfo.type);
        }
        return "runtime: " + Math.round((endTime - startTime) * 1000).toString();
    }
    /**
     * Clears all caches.
     * @returns Empty string on success
     */
    async cmd_clear() {
        await this.fut.clear_caches();
        return "";
    }
    /**
     * Gets the profiling report.
     * @returns Profiling report text
     */
    async cmd_report() {
        return await this.fut.report();
    }
    /**
     * Pauses profiling.
     * @returns Empty string on success
     */
    async cmd_pause_profiling() {
        await this.fut.pause_profiling();
        return "";
    }
    /**
     * Unpauses profiling.
     * @returns Empty string on success
     */
    async cmd_unpause_profiling() {
        await this.fut.unpause_profiling();
        return "";
    }
}
/**
 * Initializes the Futhark module and starts the WebSocket server.
 * Sets `window.fut` and `window.server` for debugging access.
 */
async function runServer() {
    const m = await Module();
    // Setting fut into the global scope makes debugging a bit easier, and this is
    // not intended to be embedded into anything other than the internal
    // `futhark test` / `futhark bench` support anyway.
    const win = window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    win.fut = new FutharkModuleClass();
    await win.fut.init(m);
    win.server = new BrowserServer(win.fut);
}
runServer();
// End of server_ws.js
//# sourceMappingURL=server_ws.js.map