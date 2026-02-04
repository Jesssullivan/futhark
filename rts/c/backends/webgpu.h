// Start of backends/webgpu.h.

// Synchronous wrapper around asynchronous WebGPU APIs, based on looping with
// emscripten_sleep until the respective callback gets called.

// Helper to convert C strings to WGPUStringView for the new Dawn API.
static inline WGPUStringView wgpu_str(const char *s) {
  WGPUStringView sv = { .data = s, .length = s ? strlen(s) : 0 };
  return sv;
}

// ============================================================================
// Error Message Helpers
// ============================================================================

// Convert WGPUErrorType to human-readable string.
static const char* wgpu_error_type_str(WGPUErrorType type) {
  switch (type) {
    case WGPUErrorType_NoError: return "NoError";
    case WGPUErrorType_Validation: return "Validation";
    case WGPUErrorType_OutOfMemory: return "OutOfMemory";
    case WGPUErrorType_Internal: return "Internal";
    case WGPUErrorType_Unknown: return "Unknown";
    case WGPUErrorType_DeviceLost: return "DeviceLost";
    default: return "Unrecognized";
  }
}

// Convert WGPUMapAsyncStatus to human-readable string.
static const char* wgpu_map_status_str(WGPUMapAsyncStatus status) {
  switch (status) {
    case WGPUMapAsyncStatus_Success: return "Success";
    case WGPUMapAsyncStatus_InstanceDropped: return "InstanceDropped";
    case WGPUMapAsyncStatus_Error: return "Error";
    case WGPUMapAsyncStatus_Aborted: return "Aborted";
    case WGPUMapAsyncStatus_Unknown: return "Unknown";
    default: return "Unrecognized";
  }
}

// Convert WGPURequestAdapterStatus to human-readable string.
static const char* wgpu_adapter_status_str(WGPURequestAdapterStatus status) {
  switch (status) {
    case WGPURequestAdapterStatus_Success: return "Success";
    case WGPURequestAdapterStatus_InstanceDropped: return "InstanceDropped";
    case WGPURequestAdapterStatus_Unavailable: return "Unavailable";
    case WGPURequestAdapterStatus_Error: return "Error";
    case WGPURequestAdapterStatus_Unknown: return "Unknown";
    default: return "Unrecognized";
  }
}

// Convert WGPURequestDeviceStatus to human-readable string.
static const char* wgpu_device_status_str(WGPURequestDeviceStatus status) {
  switch (status) {
    case WGPURequestDeviceStatus_Success: return "Success";
    case WGPURequestDeviceStatus_InstanceDropped: return "InstanceDropped";
    case WGPURequestDeviceStatus_Error: return "Error";
    case WGPURequestDeviceStatus_Unknown: return "Unknown";
    default: return "Unrecognized";
  }
}

// Convert WGPUQueueWorkDoneStatus to human-readable string.
static const char* wgpu_queue_status_str(WGPUQueueWorkDoneStatus status) {
  switch (status) {
    case WGPUQueueWorkDoneStatus_Success: return "Success";
    case WGPUQueueWorkDoneStatus_InstanceDropped: return "InstanceDropped";
    case WGPUQueueWorkDoneStatus_Error: return "Error";
    default: return "Unrecognized";
  }
}

// Convert WGPUCompilationMessageType to human-readable string.
static const char* wgpu_compilation_msg_type_str(WGPUCompilationMessageType type) {
  switch (type) {
    case WGPUCompilationMessageType_Error: return "Error";
    case WGPUCompilationMessageType_Warning: return "Warning";
    case WGPUCompilationMessageType_Info: return "Info";
    default: return "Unknown";
  }
}

// Convert WGPUCompilationInfoRequestStatus to human-readable string.
static const char* wgpu_compilation_status_str(WGPUCompilationInfoRequestStatus status) {
  switch (status) {
    case WGPUCompilationInfoRequestStatus_Success: return "Success";
    case WGPUCompilationInfoRequestStatus_InstanceDropped: return "InstanceDropped";
    case WGPUCompilationInfoRequestStatus_Error: return "Error";
    default: return "Unrecognized";
  }
}

// Format a size in bytes to a human-readable string.
static void wgpu_format_size(size_t bytes, char *buf, size_t buf_size) {
  if (bytes >= 1024 * 1024 * 1024) {
    snprintf(buf, buf_size, "%.2f GiB (%zu bytes)", (double)bytes / (1024 * 1024 * 1024), bytes);
  } else if (bytes >= 1024 * 1024) {
    snprintf(buf, buf_size, "%.2f MiB (%zu bytes)", (double)bytes / (1024 * 1024), bytes);
  } else if (bytes >= 1024) {
    snprintf(buf, buf_size, "%.2f KiB (%zu bytes)", (double)bytes / 1024, bytes);
  } else {
    snprintf(buf, buf_size, "%zu bytes", bytes);
  }
}

// ============================================================================
// End Error Message Helpers
// ============================================================================

typedef struct wgpu_wait_info {
  bool released;
  void *result;
} wgpu_wait_info;

void wgpu_map_sync_callback(WGPUMapAsyncStatus status,
                            WGPUStringView message,
                            void *userdata1, void *userdata2) {
  (void)userdata2;
  wgpu_wait_info *info = (wgpu_wait_info *)userdata1;
  *((WGPUMapAsyncStatus *) info->result) = status;
  info->released = true;

  // Log mapping failures with context.
  if (status != WGPUMapAsyncStatus_Success && message.length > 0) {
    fprintf(stderr, "WebGPU buffer mapping failed: %s\n"
                    "  Message: %.*s\n",
            wgpu_map_status_str(status),
            (int)message.length, message.data);
  }
}

WGPUMapAsyncStatus wgpu_map_buffer_sync(WGPUInstance instance,
                                        WGPUBuffer buffer,
                                        WGPUMapMode mode,
                                        size_t offset, size_t size) {
  WGPUMapAsyncStatus status;
  wgpu_wait_info info = {
    .released = false,
    .result = (void *)&status,
  };

#ifdef USE_DAWN
  WGPUBufferMapCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_WaitAnyOnly,
    .callback = wgpu_map_sync_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  WGPUFuture f = wgpuBufferMapAsyncF(buffer, mode, offset, size, cb_info);
  WGPUFutureWaitInfo f_info = { .future = f };
  while (!info.released) {
    wgpuInstanceWaitAny(instance, 1, &f_info, 0);
  }
#else
  WGPUBufferMapCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_AllowSpontaneous,
    .callback = wgpu_map_sync_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  wgpuBufferMapAsync(buffer, mode, offset, size, cb_info);

  // TODO: Should this do some kind of volatile load?
  // (Same for other _sync wrappers below.)
  while (!info.released) {
    emscripten_sleep(0);
  }
#endif

  return status;
}

typedef struct wgpu_request_adapter_result {
  WGPURequestAdapterStatus status;
  WGPUAdapter adapter;
  WGPUStringView message;
} wgpu_request_adapter_result;

void wgpu_request_adapter_callback(WGPURequestAdapterStatus status,
                                   WGPUAdapter adapter,
                                   WGPUStringView message,
                                   void *userdata1, void *userdata2) {
  (void)userdata2;
  wgpu_wait_info *info = (wgpu_wait_info *)userdata1;
  wgpu_request_adapter_result *result
    = (wgpu_request_adapter_result *)info->result;
  result->status = status;
  result->adapter = adapter;
  result->message = message;
  info->released = true;
}

wgpu_request_adapter_result wgpu_request_adapter_sync(
    WGPUInstance instance, WGPURequestAdapterOptions const * options) {
  wgpu_request_adapter_result result = {};
  wgpu_wait_info info = {
    .released = false,
    .result = (void *)&result,
  };

#ifdef USE_DAWN
  WGPURequestAdapterCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_WaitAnyOnly,
    .callback = wgpu_request_adapter_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  WGPUFuture f = wgpuInstanceRequestAdapterF(instance, options, cb_info);
  WGPUFutureWaitInfo f_info = { .future = f };
  while (!info.released) {
    wgpuInstanceWaitAny(instance, 1, &f_info, 0);
  }
#else
  WGPURequestAdapterCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_AllowSpontaneous,
    .callback = wgpu_request_adapter_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  wgpuInstanceRequestAdapter(instance, options, cb_info);

  while (!info.released) {
    emscripten_sleep(0);
  }
#endif

  return result;
}

typedef struct wgpu_request_device_result {
  WGPURequestDeviceStatus status;
  WGPUDevice device;
  WGPUStringView message;
} wgpu_request_device_result;

void wgpu_request_device_callback(WGPURequestDeviceStatus status,
                                  WGPUDevice device,
                                  WGPUStringView message,
                                  void *userdata1, void *userdata2) {
  (void)userdata2;
  wgpu_wait_info *info = (wgpu_wait_info *)userdata1;
  wgpu_request_device_result *result
    = (wgpu_request_device_result *)info->result;
  result->status = status;
  result->device = device;
  result->message = message;
  info->released = true;
}

wgpu_request_device_result wgpu_request_device_sync(
    WGPUInstance instance,
    WGPUAdapter adapter,
    WGPUDeviceDescriptor const * descriptor
) {
  wgpu_request_device_result result = {};
  wgpu_wait_info info = {
    .released = false,
    .result = (void *)&result,
  };

#ifdef USE_DAWN
  WGPURequestDeviceCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_WaitAnyOnly,
    .callback = wgpu_request_device_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  WGPUFuture f = wgpuAdapterRequestDeviceF(adapter, descriptor, cb_info);
  WGPUFutureWaitInfo f_info = { .future = f };
  while (!info.released) {
    wgpuInstanceWaitAny(instance, 1, &f_info, 0);
  }
#else
  WGPURequestDeviceCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_AllowSpontaneous,
    .callback = wgpu_request_device_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  wgpuAdapterRequestDevice(adapter, descriptor, cb_info);

  while (!info.released) {
    emscripten_sleep(0);
  }
#endif

  return result;
}

void wgpu_on_work_done_callback(WGPUQueueWorkDoneStatus status,
                                void *userdata1, void *userdata2) {
  (void)userdata2;
  wgpu_wait_info *info = (wgpu_wait_info *)userdata1;
  *((WGPUQueueWorkDoneStatus *)info->result) = status;
  info->released = true;
}

WGPUQueueWorkDoneStatus wgpu_block_until_work_done(WGPUInstance instance,
                                                   WGPUQueue queue) {
  WGPUQueueWorkDoneStatus status;
  wgpu_wait_info info = {
    .released = false,
    .result = (void *)&status,
  };


#ifdef USE_DAWN
  WGPUQueueWorkDoneCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_WaitAnyOnly,
    .callback = wgpu_on_work_done_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  WGPUFuture f = wgpuQueueOnSubmittedWorkDoneF(queue, cb_info);
  WGPUFutureWaitInfo f_info = { .future = f };
  while (!info.released) {
    wgpuInstanceWaitAny(instance, 1, &f_info, 0);
  }
#else
  WGPUQueueWorkDoneCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_AllowSpontaneous,
    .callback = wgpu_on_work_done_callback,
    .userdata1 = (void *) &info,
    .userdata2 = NULL,
  };
  wgpuQueueOnSubmittedWorkDone(queue, cb_info);

  while (!info.released) {
    emscripten_sleep(0);
  }
#endif

  return status;
}

void wgpu_on_uncaptured_error(WGPUDevice const *device,
                              WGPUErrorType error_type,
                              WGPUStringView message,
                              void *userdata1, void *userdata2) {
  (void)device;
  (void)userdata1;
  (void)userdata2;

  const char *type_str = wgpu_error_type_str(error_type);
  const char *hint = "";

  // Provide actionable hints based on error type.
  switch (error_type) {
    case WGPUErrorType_Validation:
      hint = "  Hint: Check shader code for type mismatches, binding errors, or invalid operations.\n";
      break;
    case WGPUErrorType_OutOfMemory:
      hint = "  Hint: Reduce data sizes, free unused buffers, or use smaller workgroup sizes.\n"
             "        Consider breaking large operations into smaller batches.\n";
      break;
    case WGPUErrorType_DeviceLost:
      hint = "  Hint: The GPU device was lost (possibly due to driver crash, timeout, or power event).\n"
             "        The application must be restarted to recover.\n";
      break;
    case WGPUErrorType_Internal:
      hint = "  Hint: This is a WebGPU implementation bug. Please report this issue.\n";
      break;
    default:
      break;
  }

  futhark_panic(-1,
    "===========================================================================\n"
    "WebGPU Uncaptured Error\n"
    "===========================================================================\n"
    "  Error Type: %s (code %d)\n"
    "  Message: %.*s\n"
    "%s"
    "===========================================================================\n",
    type_str, error_type,
    (int)message.length, message.data,
    hint);
}

// Structure to track shader compilation state for better error reporting.
typedef struct wgpu_shader_compile_state {
  const char *shader_label;
  bool has_errors;
} wgpu_shader_compile_state;

void wgpu_on_shader_compiled(WGPUCompilationInfoRequestStatus status,
                             struct WGPUCompilationInfo const * compilationInfo,
                             void * userdata1, void * userdata2) {
  (void)userdata2;
  wgpu_shader_compile_state *state = (wgpu_shader_compile_state *)userdata1;
  const char *shader_label = state ? state->shader_label : "unknown";

  // Check compilation info request status.
  if (status != WGPUCompilationInfoRequestStatus_Success) {
    fprintf(stderr,
      "WebGPU shader compilation info request failed for '%s': %s\n",
      shader_label, wgpu_compilation_status_str(status));
    return;
  }

  if (compilationInfo->messageCount == 0) {
    return; // No messages - compilation succeeded silently.
  }

  // Count errors vs warnings for summary.
  size_t error_count = 0;
  size_t warning_count = 0;
  size_t info_count = 0;

  for (size_t i = 0; i < compilationInfo->messageCount; i++) {
    switch (compilationInfo->messages[i].type) {
      case WGPUCompilationMessageType_Error: error_count++; break;
      case WGPUCompilationMessageType_Warning: warning_count++; break;
      case WGPUCompilationMessageType_Info: info_count++; break;
      default: break;
    }
  }

  // Print header.
  fprintf(stderr,
    "===========================================================================\n"
    "WGSL Shader Compilation Report: '%s'\n"
    "  %zu error(s), %zu warning(s), %zu info message(s)\n"
    "===========================================================================\n",
    shader_label, error_count, warning_count, info_count);

  // Print each message with location information.
  for (size_t i = 0; i < compilationInfo->messageCount; i++) {
    WGPUCompilationMessage msg = compilationInfo->messages[i];
    const char *type_str = wgpu_compilation_msg_type_str(msg.type);

    // Print message header with type and location.
    if (msg.lineNum > 0) {
      fprintf(stderr, "[%s] Line %llu", type_str, (unsigned long long)msg.lineNum);
      if (msg.linePos > 0) {
        fprintf(stderr, ", Column %llu", (unsigned long long)msg.linePos);
      }
      fprintf(stderr, ":\n");
    } else {
      fprintf(stderr, "[%s]:\n", type_str);
    }

    // Print the actual message.
    fprintf(stderr, "  %.*s\n", (int)msg.message.length, msg.message.data);

    // Print offset information if available (for programmatic use).
    if (msg.offset > 0 || msg.length > 0) {
      fprintf(stderr, "  (offset: %llu, length: %llu)\n",
              (unsigned long long)msg.offset, (unsigned long long)msg.length);
    }

    fprintf(stderr, "\n");
  }

  fprintf(stderr,
    "===========================================================================\n");

  // Track if there were errors.
  if (state && error_count > 0) {
    state->has_errors = true;
  }
}

struct futhark_context_config {
  int in_use;
  int debugging;
  int profiling;
  int logging;
  char *cache_fname;
  int num_tuning_params;
  int64_t *tuning_params;
  const char** tuning_param_names;
  const char** tuning_param_vars;
  const char** tuning_param_classes;
  // Uniform fields above.

  char *program;

  struct gpu_config gpu;
};

static void backend_context_config_setup(struct futhark_context_config *cfg) {
  cfg->program = strconcat(gpu_program);

  cfg->gpu.default_block_size = 256;
  cfg->gpu.default_grid_size = 0; // Set properly later.
  cfg->gpu.default_tile_size = 32;
  cfg->gpu.default_reg_tile_size = 2;
  cfg->gpu.default_threshold = 32*1024;

  cfg->gpu.default_block_size_changed = 0;
  cfg->gpu.default_grid_size_changed = 0;
  cfg->gpu.default_tile_size_changed = 0;
}

static void backend_context_config_teardown(struct futhark_context_config *cfg) {
  free(cfg->program);
}

const char* futhark_context_config_get_program(struct futhark_context_config *cfg) {
  return cfg->program;
}

void futhark_context_config_set_program(struct futhark_context_config *cfg, const char *s) {
  free(cfg->program);
  cfg->program = strdup(s);
}

struct futhark_context {
  struct futhark_context_config* cfg;
  int detail_memory;
  int debugging;
  int profiling;
  int profiling_paused;
  int logging;
  lock_t lock;
  char *error;
  lock_t error_lock;
  FILE *log;
  struct constants *constants;
  struct free_list free_list;
  struct event_list event_list;
  int64_t peak_mem_usage_default;
  int64_t cur_mem_usage_default;
  struct program* program;
  bool program_initialised;
  // Uniform fields above.

  struct tuning_params tuning_params;
  // True if a potentially failing kernel has been enqueued.
  int32_t failure_is_an_option;
  int total_runs;
  long int total_runtime;
  int64_t peak_mem_usage_device;
  int64_t cur_mem_usage_device;

  int num_overrides;
  char **override_names;
  double *override_values;

  WGPUInstance instance;
  WGPUAdapter adapter;
  WGPUDevice device;
  WGPUQueue queue;
  // One module contains all the kernels as separate entry points.
  WGPUShaderModule module;

  WGPUBuffer scalar_readback_buffer;
  struct free_list gpu_free_list;

  size_t lockstep_width;
  size_t max_thread_block_size;
  size_t max_grid_size;
  size_t max_tile_size;
  size_t max_threshold;
  size_t max_shared_memory;
  size_t max_registers;
  size_t max_cache;

  struct builtin_kernels* kernels;
};

int futhark_context_sync(struct futhark_context *ctx) {
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Synchronizing context (waiting for queue work done)...\n");
  }

  WGPUQueueWorkDoneStatus status = wgpu_block_until_work_done(ctx->instance,
                                                              ctx->queue);
  if (status != WGPUQueueWorkDoneStatus_Success) {
    const char *status_str = wgpu_queue_status_str(status);
    const char *hint = "";

    switch (status) {
      case WGPUQueueWorkDoneStatus_Error:
        hint = "  Hint: A GPU error occurred during command execution.\n"
               "        Check for shader errors or invalid buffer operations.\n";
        break;
      case WGPUQueueWorkDoneStatus_InstanceDropped:
        hint = "  Hint: The WebGPU instance was dropped unexpectedly.\n"
               "        This may indicate a context or page lifecycle issue.\n";
        break;
      default:
        break;
    }

    futhark_panic(-1,
      "WebGPU error in futhark_context_sync: Failed to wait for queue work\n"
      "  Status: %s (code %d)\n"
      "%s",
      status_str, status, hint);
  }

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Context synchronized successfully.\n");
  }

  return FUTHARK_SUCCESS;
}

static void wgpu_size_setup(struct futhark_context *ctx) {
  struct futhark_context_config *cfg = ctx->cfg;
  // TODO: Deal with the device limits here, see cuda.h.

  // TODO: See if we can also do some proper heuristic for default_grid_size
  // here.
  if (!cfg->gpu.default_grid_size_changed) {
    cfg->gpu.default_grid_size = 16;
  }

  for (int i = 0; i < cfg->num_tuning_params; i++) {
    const char *size_class = cfg->tuning_param_classes[i];
    int64_t *size_value = &cfg->tuning_params[i];
    const char* size_name = cfg->tuning_param_names[i];
    //int64_t max_value = 0;
    int64_t default_value = 0;

    if (strstr(size_class, "thread_block_size") == size_class) {
      //max_value = ctx->max_thread_block_size;
      default_value = cfg->gpu.default_block_size;
    } else if (strstr(size_class, "grid_size") == size_class) {
      //max_value = ctx->max_grid_size;
      default_value = cfg->gpu.default_grid_size;
      // XXX: as a quick and dirty hack, use twice as many threads for
      // histograms by default.  We really should just be smarter
      // about sizes somehow.
      if (strstr(size_name, ".seghist_") != NULL) {
        default_value *= 2;
      }
    } else if (strstr(size_class, "tile_size") == size_class) {
      //max_value = ctx->max_tile_size;
      default_value = cfg->gpu.default_tile_size;
    } else if (strstr(size_class, "reg_tile_size") == size_class) {
      //max_value = 0; // No limit.
      default_value = cfg->gpu.default_reg_tile_size;
    } else if (strstr(size_class, "shared_memory") == size_class) {
      default_value = ctx->max_shared_memory;
    } else if (strstr(size_class, "cache") == size_class) {
      default_value = ctx->max_cache;
    } else if (strstr(size_class, "threshold") == size_class) {
      // Threshold can be as large as it takes.
      default_value = cfg->gpu.default_threshold;
    } else {
      // Bespoke sizes have no limit or default.
    }

    if (*size_value == 0) {
      *size_value = default_value;
    //} else if (max_value > 0 && *size_value > max_value) {
    //  fprintf(stderr, "Note: Device limits %s to %zu (down from %zu)\n",
    //          size_name, max_value, *size_value);
    //  *size_value = max_value;
    }
  }
}

void wgpu_module_setup(struct futhark_context *ctx, const char *program, WGPUShaderModule *module, const char* label) {
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Compiling shader module '%s'...\n", label);
  }

  WGPUShaderSourceWGSL wgsl_desc = {
    .chain = {
      .sType = WGPUSType_ShaderSourceWGSL
    },
    .code = wgpu_str(program)
  };
  WGPUShaderModuleDescriptor desc = {
    .label = wgpu_str(label),
    .nextInChain = &wgsl_desc.chain
  };
  *module = wgpuDeviceCreateShaderModule(ctx->device, &desc);

  if (*module == NULL) {
    futhark_panic(-1,
      "WebGPU error in wgpu_module_setup: Failed to create shader module '%s'\n"
      "  Hint: Check that the WGSL source is valid and the device supports required features.\n",
      label);
  }

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Shader module '%s' created, fetching compilation info...\n", label);
  }

  // Set up compilation state for error tracking.
  wgpu_shader_compile_state compile_state = {
    .shader_label = label,
    .has_errors = false,
  };

  WGPUCompilationInfoCallbackInfo cb_info = {
    .mode = WGPUCallbackMode_AllowSpontaneous,
    .callback = wgpu_on_shader_compiled,
    .userdata1 = &compile_state,
    .userdata2 = NULL,
  };
  wgpuShaderModuleGetCompilationInfo(*module, cb_info);
}

struct builtin_kernels* init_builtin_kernels(struct futhark_context* ctx);
void free_builtin_kernels(struct futhark_context* ctx, struct builtin_kernels* kernels);

int backend_context_setup(struct futhark_context *ctx) {
  ctx->failure_is_an_option = 0;
  ctx->total_runs = 0;
  ctx->total_runtime = 0;
  ctx->peak_mem_usage_device = 0;
  ctx->cur_mem_usage_device = 0;
  ctx->kernels = NULL;

  // These are the default limits from the spec, which will always be the actual
  // limit unless we explicitly request a larger one (which we do not currently
  // do).
  ctx->max_thread_block_size = 256;
  ctx->max_grid_size = 65536; // TODO: idk what these should be, just put a large enough value.
  ctx->max_tile_size = 65536; // TODO: idk what these should be, just put a large enough value.
  ctx->max_threshold = 65536; // TODO: idk what these should be, just put a large enough value.
  ctx->max_shared_memory = 16384;

  ctx->max_registers = 65536; // TODO: idk what these should be, just put a large enough value.

  // This is a number we picked semi-arbitrarily (2 MiB). There does not seem to
  // be a way to get L2 cache size from the WebGPU API.
  ctx->max_cache = 2097152;

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Initializing WebGPU backend...\n");
  }

  ctx->instance = wgpuCreateInstance(NULL);

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] WebGPU instance created, requesting adapter...\n");
  }

  wgpu_request_adapter_result adapter_result
    = wgpu_request_adapter_sync(ctx->instance, NULL);
  if (adapter_result.status != WGPURequestAdapterStatus_Success) {
    const char *status_str = wgpu_adapter_status_str(adapter_result.status);
    const char *hint = "";

    switch (adapter_result.status) {
      case WGPURequestAdapterStatus_Unavailable:
        hint = "  Hint: No compatible GPU adapter found. Ensure:\n"
               "        - WebGPU is supported by your browser/runtime\n"
               "        - GPU drivers are up to date\n"
               "        - Hardware acceleration is enabled\n";
        break;
      case WGPURequestAdapterStatus_Error:
        hint = "  Hint: An error occurred while requesting the adapter.\n"
               "        Check browser console for additional details.\n";
        break;
      case WGPURequestAdapterStatus_InstanceDropped:
        hint = "  Hint: The WebGPU instance was dropped before adapter request completed.\n";
        break;
      default:
        break;
    }

    if (adapter_result.message.data != NULL && adapter_result.message.length > 0) {
      futhark_panic(-1,
        "WebGPU error in backend_context_setup: Failed to get adapter\n"
        "  Status: %s (code %d)\n"
        "  Message: %.*s\n"
        "%s",
        status_str, adapter_result.status,
        (int)adapter_result.message.length, adapter_result.message.data,
        hint);
    } else {
      futhark_panic(-1,
        "WebGPU error in backend_context_setup: Failed to get adapter\n"
        "  Status: %s (code %d)\n"
        "%s",
        status_str, adapter_result.status,
        hint);
    }
  }
  ctx->adapter = adapter_result.adapter;

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Adapter acquired successfully.\n");
  }

  // We want to request the max limits possible.
  // Some limits, like maxStorageBuffersPerShaderStage has a huge impact
  // on what programs we can run, so we need to request the maximum possible.
  WGPULimits supported = {0};
  WGPUStatus res = wgpuAdapterGetLimits(ctx->adapter, &supported);
  if (res != WGPUStatus_Success) {
    futhark_panic(-1,
      "WebGPU error in backend_context_setup: Failed to get adapter limits\n"
      "  Status code: %d\n"
      "  Hint: The adapter may have been lost or is in an invalid state.\n",
      res);
  }
  WGPULimits required_limits;
  // If we just zero this memory, stuff crashes in the generated empscripten js.
  // For some reason, we have to set it to all 1s?
  memset((void*)&required_limits, 0xff, sizeof(required_limits));
  required_limits.maxBindGroups = supported.maxBindGroups;
  required_limits.maxBindingsPerBindGroup = supported.maxBindingsPerBindGroup;
  required_limits.maxDynamicUniformBuffersPerPipelineLayout = supported.maxDynamicUniformBuffersPerPipelineLayout;
  required_limits.maxDynamicStorageBuffersPerPipelineLayout = supported.maxDynamicStorageBuffersPerPipelineLayout;
  required_limits.maxStorageBuffersPerShaderStage = supported.maxStorageBuffersPerShaderStage;
  required_limits.maxUniformBuffersPerShaderStage = supported.maxUniformBuffersPerShaderStage;
  required_limits.maxUniformBufferBindingSize = supported.maxUniformBufferBindingSize;
  required_limits.maxStorageBufferBindingSize = supported.maxStorageBufferBindingSize;
  required_limits.maxBufferSize = supported.maxBufferSize;
  required_limits.maxComputeWorkgroupStorageSize = supported.maxComputeWorkgroupStorageSize;
  required_limits.maxComputeInvocationsPerWorkgroup = supported.maxComputeInvocationsPerWorkgroup;
  required_limits.maxComputeWorkgroupSizeX = supported.maxComputeWorkgroupSizeX;
  required_limits.maxComputeWorkgroupSizeY = supported.maxComputeWorkgroupSizeY;
  required_limits.maxComputeWorkgroupSizeZ = supported.maxComputeWorkgroupSizeZ;
  required_limits.maxComputeWorkgroupsPerDimension = supported.maxComputeWorkgroupsPerDimension;

  // Require support for 16-bit floats
  WGPUFeatureName required_features[] = { WGPUFeatureName_ShaderF16 };
  WGPUDeviceDescriptor device_desc = {
    .requiredFeatureCount = 1,
    .requiredFeatures = required_features,
    .requiredLimits = &required_limits,
    // Set uncaptured error callback at device creation time (new Dawn API)
    .uncapturedErrorCallbackInfo = {
      .callback = wgpu_on_uncaptured_error,
      .userdata1 = ctx,
      .userdata2 = NULL,
    },
  };
  wgpu_request_device_result device_result
    = wgpu_request_device_sync(ctx->instance, ctx->adapter, &device_desc);
  if (device_result.status != WGPURequestDeviceStatus_Success) {
    const char *status_str = wgpu_device_status_str(device_result.status);
    const char *hint =
      "  Hint: The device request failed. This could be due to:\n"
      "        - Unsupported required features (e.g., ShaderF16)\n"
      "        - Requested limits exceeding adapter capabilities\n"
      "        - GPU driver or browser issues\n";

    if (device_result.message.data != NULL && device_result.message.length > 0) {
      futhark_panic(-1,
        "WebGPU error in backend_context_setup: Failed to get device\n"
        "  Status: %s (code %d)\n"
        "  Message: %.*s\n"
        "%s",
        status_str, device_result.status,
        (int)device_result.message.length, device_result.message.data,
        hint);
    } else {
      futhark_panic(-1,
        "WebGPU error in backend_context_setup: Failed to get device\n"
        "  Status: %s (code %d)\n"
        "%s",
        status_str, device_result.status,
        hint);
    }
  }
  ctx->device = device_result.device;

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Device acquired successfully.\n");
    fprintf(ctx->log, "[WebGPU DEBUG] Device limits:\n");
    fprintf(ctx->log, "[WebGPU DEBUG]   maxStorageBuffersPerShaderStage: %u\n", supported.maxStorageBuffersPerShaderStage);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxStorageBufferBindingSize: %llu\n", (unsigned long long)supported.maxStorageBufferBindingSize);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxBufferSize: %llu\n", (unsigned long long)supported.maxBufferSize);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeWorkgroupStorageSize: %u\n", supported.maxComputeWorkgroupStorageSize);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeInvocationsPerWorkgroup: %u\n", supported.maxComputeInvocationsPerWorkgroup);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeWorkgroupSizeX: %u\n", supported.maxComputeWorkgroupSizeX);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeWorkgroupSizeY: %u\n", supported.maxComputeWorkgroupSizeY);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeWorkgroupSizeZ: %u\n", supported.maxComputeWorkgroupSizeZ);
    fprintf(ctx->log, "[WebGPU DEBUG]   maxComputeWorkgroupsPerDimension: %u\n", supported.maxComputeWorkgroupsPerDimension);
  }

  ctx->queue = wgpuDeviceGetQueue(ctx->device);

  wgpu_size_setup(ctx);

  WGPUBufferDescriptor scalar_buf_desc = {
    .label = wgpu_str("scalar_readback"),
    .size = 8,
    .usage = WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst,
  };
  ctx->scalar_readback_buffer = wgpuDeviceCreateBuffer(ctx->device, &scalar_buf_desc);
  free_list_init(&ctx->gpu_free_list);

  // We implement macros as override constants.
  int64_t *macro_vals;
  ctx->num_overrides = gpu_macros(ctx, &ctx->override_names,
                                  &macro_vals);
  ctx->override_values = malloc(ctx->num_overrides * sizeof(double));
  for (int i = 0; i < ctx->num_overrides; i++) {
    ctx->override_values[i] = (double) macro_vals[i];
  }
  free(macro_vals);

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Compiling main shader module...\n");
  }

  wgpu_module_setup(ctx, ctx->cfg->program, &ctx->module, "Futhark program");

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Shader module compiled successfully.\n");
    fprintf(ctx->log, "[WebGPU DEBUG] Initializing builtin kernels...\n");
  }

  if ((ctx->kernels = init_builtin_kernels(ctx)) == NULL) {
    printf("Failed to init builtin kernels\n");
    return 1;
  }

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] WebGPU backend initialized successfully.\n");
  }

  return 0;
}

void backend_context_teardown(struct futhark_context *ctx) {
  if (ctx->kernels != NULL) {
    free_builtin_kernels(ctx, ctx->kernels);
  } // TODO
    free(ctx->override_names);
    free(ctx->override_values);

    if (gpu_free_all(ctx) != FUTHARK_SUCCESS) {
      futhark_panic(-1, "gpu_free_all failed");
    }
    wgpuBufferDestroy(ctx->scalar_readback_buffer);
    wgpuDeviceDestroy(ctx->device);
  //}
  free_list_destroy(&ctx->gpu_free_list);
}

// Definitions for these are included as part of code generation.
// wgpu_kernel_info contains:
//   char *name;
//
//   size_t num_scalars;
//   size_t scalars_binding;
//   size_t scalars_size;
//   size_t *scalar_offsets;
//
//   size_t num_bindings; // excluding the scalars binding
//   uint32_t *binding_indices;
//
//   size_t num_overrides;
//   char **used_overrides;

//   size_t num_dynamic_block_dims;
//   uint32_t *dynamic_block_dim_indices;
//   char **dynamic_block_dim_names;
//
//   size_t num_shared_mem_overrides;
//   char **shared_mem_overrides;
struct wgpu_kernel_info;
static size_t wgpu_num_kernel_infos;
static wgpu_kernel_info wgpu_kernel_infos[];

struct wgpu_kernel_info *wgpu_get_kernel_info(const char *name) {
  for (int i = 0; i < wgpu_num_kernel_infos; i++) {
    if (strcmp(name, wgpu_kernel_infos[i].name) == 0) {
      return &wgpu_kernel_infos[i];
    }
  }

  return NULL;
}

// GPU ABSTRACTION LAYER

// Types.
struct wgpu_kernel {
  struct wgpu_kernel_info *info;

  WGPUBuffer scalars_buffer;
  WGPUBindGroupLayout bind_group_layout;
  WGPUPipelineLayout pipeline_layout;

  // True if we can create a single pipeline in `gpu_create_kernel`. If false,
  // need to create a new pipeline for every kernel launch.
  bool static_pipeline;

  // ShaderModule for this kernel. Generated from the gpu_program of the kernel
  // info.
  WGPUShaderModule module;

  // Only set if static_pipeline.
  WGPUComputePipeline pipeline;

  // Only set if !static_pipeline.
  WGPUConstantEntry *const_entries;

  // How many entries are already set; there is enough space in the allocation
  // to additionally set the shared memory and dynamic block dimension entries.
  int const_entries_set;
};
typedef struct wgpu_kernel* gpu_kernel;
typedef WGPUBuffer gpu_mem;

static int gpu_alloc_actual(struct futhark_context *ctx,
  size_t size, gpu_mem *mem_out) {
  // Storage buffer bindings must have an effective size that is a multiple of
  // 4, so we round up all allocations.
  size_t original_size = size;
  size = ((size + 4 - 1) / 4) * 4;

  if (ctx->debugging) {
    char size_str[64];
    wgpu_format_size(size, size_str, sizeof(size_str));
    fprintf(ctx->log, "[WebGPU DEBUG] Allocating buffer: %s (storage)\n", size_str);
  }

  WGPUBufferDescriptor desc = {
    .size = size,
    .usage = WGPUBufferUsage_CopySrc
    | WGPUBufferUsage_CopyDst
    | WGPUBufferUsage_Storage,
  };
  *mem_out = wgpuDeviceCreateBuffer(ctx->device, &desc);

  if (*mem_out == NULL) {
    char size_str[64];
    wgpu_format_size(size, size_str, sizeof(size_str));
    futhark_panic(-1,
      "WebGPU error in gpu_alloc_actual: Failed to create buffer\n"
      "  Requested size: %s\n"
      "  Original request: %zu bytes (padded to %zu for alignment)\n"
      "  Current GPU memory usage: %lld bytes\n"
      "  Peak GPU memory usage: %lld bytes\n"
      "  Hint: The device may be out of memory. Try:\n"
      "        - Reducing input data sizes\n"
      "        - Freeing unused arrays\n"
      "        - Breaking computation into smaller batches\n",
      size_str, original_size, size,
      (long long)ctx->cur_mem_usage_device,
      (long long)ctx->peak_mem_usage_device);
  }

  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Buffer allocated successfully.\n");
  }

  return FUTHARK_SUCCESS;
}

static int gpu_free_actual(struct futhark_context *ctx, gpu_mem mem) {
  if (ctx->debugging) {
    uint64_t buf_size = wgpuBufferGetSize(mem);
    char size_str[64];
    wgpu_format_size(buf_size, size_str, sizeof(size_str));
    fprintf(ctx->log, "[WebGPU DEBUG] Freeing buffer: %s\n", size_str);
  }
  wgpuBufferDestroy(mem);
  return FUTHARK_SUCCESS;
}

static void gpu_create_kernel(struct futhark_context *ctx,
                              gpu_kernel *kernel_out,
                              const char *name) {
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Creating kernel '%s'.\n", name);
  }

  struct wgpu_kernel_info *kernel_info = wgpu_get_kernel_info(name);
  struct wgpu_kernel *kernel = malloc(sizeof(struct wgpu_kernel));
  kernel->info = kernel_info;

  // If this is a builtin kernel, generate the shader module here
  if (kernel_info->gpu_program[0]) {
    const char* wgsl = strconcat(kernel_info->gpu_program);
    wgpu_module_setup(ctx, wgsl, &kernel->module, name);
    free((void*)wgsl);
  }
  else {
    kernel->module = ctx->module;
  }

  WGPUBufferDescriptor scalars_desc = {
    .label = wgpu_str("kernel scalars"),
    .size = kernel_info->scalars_size,
    .usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst
  };
  kernel->scalars_buffer = wgpuDeviceCreateBuffer(ctx->device, &scalars_desc);

  // Create bind group layout.
  WGPUBindGroupLayoutEntry *bgl_entries
    = calloc(1 + kernel_info->num_bindings, sizeof(WGPUBindGroupLayoutEntry));

  WGPUBindGroupLayoutEntry *scalar_entry = bgl_entries;
  scalar_entry->binding = kernel_info->scalars_binding;
  scalar_entry->visibility = WGPUShaderStage_Compute;
  WGPUBufferBindingLayout scalar_buffer_layout
    = { .type = WGPUBufferBindingType_Uniform };
  scalar_entry->buffer = scalar_buffer_layout;

  for (int i = 0; i < kernel_info->num_bindings; i++) {
    WGPUBindGroupLayoutEntry *entry = &bgl_entries[1 + i];
    entry->binding = kernel_info->binding_indices[i];
    entry->visibility = WGPUShaderStage_Compute;
    WGPUBufferBindingLayout buffer_layout
      = { .type = WGPUBufferBindingType_Storage };
    entry->buffer = buffer_layout;
  }
  WGPUBindGroupLayoutDescriptor bgl_desc = {
    .entryCount = 1 + kernel_info->num_bindings,
    .entries = bgl_entries
  };
  kernel->bind_group_layout
    = wgpuDeviceCreateBindGroupLayout(ctx->device, &bgl_desc);
  free(bgl_entries);

  // Create pipeline layout.
  WGPUPipelineLayoutDescriptor pl = {
    .bindGroupLayoutCount = 1,
    .bindGroupLayouts = &kernel->bind_group_layout,
  };
  kernel->pipeline_layout = wgpuDeviceCreatePipelineLayout(ctx->device, &pl);

  // Create constants / overrides.
  // TODO: We should be able to just set all overrides from the context and
  // remove the used_overrides from kernel_info. It only exists because
  // Chrome/Dawn currently complains if we set unused constants, see
  // https://issues.chromium.org/issues/338624452.
  WGPUConstantEntry *const_entries = calloc(kernel_info->num_overrides,
                                            sizeof(WGPUConstantEntry));
  int const_idx = 0;
  for (int i = 0; i < ctx->num_overrides; i++) {
    for (int j = 0; j < kernel_info->num_overrides; j++) {
      if (strcmp(kernel_info->used_overrides[j], ctx->override_names[i]) == 0) {
        WGPUConstantEntry *entry = &const_entries[const_idx];
        entry->key = wgpu_str(ctx->override_names[i]);
        entry->value = ctx->override_values[i];
        const_idx++;
      }
    }
  }

  kernel->static_pipeline =
    kernel_info->num_dynamic_block_dims == 0
    && kernel_info->num_shared_mem_overrides == 0;
  if (!kernel->static_pipeline) {
    kernel->const_entries = const_entries;
    kernel->const_entries_set = const_idx;
  }
  else {
    // Create pipeline.
    WGPUComputePipelineDescriptor desc = {
      .layout = kernel->pipeline_layout,
      .compute = {
        .module = kernel_info->gpu_program[0] ? kernel->module : ctx->module,
        .entryPoint = wgpu_str(kernel_info->name),
        .constantCount = kernel_info->num_overrides,
        .constants = const_entries,
      }
    };

    kernel->pipeline = wgpuDeviceCreateComputePipeline(ctx->device, &desc);

    free(const_entries);
  }

  *kernel_out = kernel;
}

static void gpu_free_kernel(struct futhark_context *ctx,
                            gpu_kernel kernel) {
  (void)ctx;
  wgpuBufferDestroy(kernel->scalars_buffer);
  free(kernel);
}

static int gpu_scalar_to_device(struct futhark_context *ctx,
                                const char *provenance,
                                gpu_mem dst, size_t offset, size_t size,
                                void *src) {
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Transfer scalar host->device: %zu bytes at offset %zu\n",
            size, offset);
  }
  wgpuQueueWriteBuffer(ctx->queue, dst, offset, src, size);
  return FUTHARK_SUCCESS;
}

static int gpu_scalar_from_device(struct futhark_context *ctx,
                                  const char *provenance,
                                  void *dst,
                                  gpu_mem src, size_t offset, size_t size) {
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Transfer scalar device->host: %zu bytes at offset %zu\n",
            size, offset);
  }

  if (size > 8) {
    futhark_panic(-1, "gpu_scalar_from_device with size %zu > 8 is not allowed\n",
                  size);
  }

  size_t copy_size = ((size + 4 - 1) / 4) * 4;

  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(ctx->device, NULL);
  wgpuCommandEncoderCopyBufferToBuffer(encoder,
    src, offset,
    ctx->scalar_readback_buffer, 0,
    copy_size);

  WGPUCommandBuffer commandBuffer = wgpuCommandEncoderFinish(encoder, NULL);
  wgpuQueueSubmit(ctx->queue, 1, &commandBuffer);

  WGPUMapAsyncStatus status =
    wgpu_map_buffer_sync(ctx->instance, ctx->scalar_readback_buffer,
                         WGPUMapMode_Read, 0, copy_size);
  if (status != WGPUMapAsyncStatus_Success) {
    futhark_panic(-1, "gpu_scalar_from_device: Failed to read scalar from device memory with error %d\n",
                  status);
  }

  const void *mapped = wgpuBufferGetConstMappedRange(ctx->scalar_readback_buffer,
                                                     0, copy_size);
  memcpy(dst, mapped, size);

  wgpuBufferUnmap(ctx->scalar_readback_buffer);
  return FUTHARK_SUCCESS;
}

static int memcpy_host2gpu(struct futhark_context *ctx,
                           const char *provenance,
                           bool sync,
                           gpu_mem dst, int64_t dst_offset,
                           const unsigned char *src, int64_t src_offset,
                           int64_t nbytes) {
  if (nbytes <= 0) { return FUTHARK_SUCCESS; }

  if (ctx->debugging) {
    char size_str[64];
    wgpu_format_size(nbytes, size_str, sizeof(size_str));
    fprintf(ctx->log, "[WebGPU DEBUG] Transfer host->device: %s at offset %lld\n",
            size_str, (long long)dst_offset);
  }

  // There is no async copy to device memory at the moment (the spec for
  // `writeBuffer` specifies that a copy of the data is always made and there is
  // no other good option to use here), so we ignore the sync parameter.
  (void)sync;

  // Bound storage buffers and copy operations must have sizes multiple of 4.
  // Note that writing more than `nbytes` is safe because we also pad all
  // buffers when allocating them, but we can't guarantee that the `src` here
  // has enough bytes.
  // If this is a copy somewhere into the middle of `dst`, it is also possible
  // we overwrite some data here, which would be bad.
  int64_t copy_size = ((nbytes + 4 - 1) / 4) * 4;
  if (copy_size > nbytes) {
    // Potential for an issue if we're not at the end of the destination buffer.
    // Find its size to make sure.
    uint64_t dst_size = wgpuBufferGetSize(dst);
    if (dst_offset + copy_size != dst_size) {
      printf("memcpy_host2gpu: Potentially could corrupt data due to padding!\n");
      //futhark_panic(-1, "memcpy_host2gpu: Would corrupt data due to padding!\n");
    }
  }

  const unsigned char *buf;
  int64_t offset;
  if (copy_size > nbytes) {
    buf = malloc(copy_size);
    offset = 0;
    memcpy((unsigned char*)buf, src + src_offset, copy_size);
  }
  else {
    buf = src;
    offset = src_offset;
  }

  wgpuQueueWriteBuffer(ctx->queue, dst, dst_offset, buf + offset, copy_size);

  if (buf != src) {
    free((void*)buf);
  }

  return FUTHARK_SUCCESS;
}

static int memcpy_gpu2host(struct futhark_context *ctx,
                           const char *provenance,
                           bool sync,
                           unsigned char *dst, int64_t dst_offset,
                           gpu_mem src, int64_t src_offset,
                           int64_t nbytes) {
  if (nbytes <= 0) { return FUTHARK_SUCCESS; }

  if (ctx->debugging) {
    char size_str[64];
    wgpu_format_size(nbytes, size_str, sizeof(size_str));
    fprintf(ctx->log, "[WebGPU DEBUG] Transfer device->host: %s at offset %lld\n",
            size_str, (long long)src_offset);
  }

  // Bound storage buffers and copy operations must have sizes multiple of 4.
  // Note that mapping more than `nbytes` is safe because we also pad all
  // buffers when allocating them.
  int64_t buf_size = ((nbytes + 4 - 1) / 4) * 4;

  WGPUBufferDescriptor desc = {
    .label = wgpu_str("tmp_readback"),
    .size = buf_size,
    .usage = WGPUBufferUsage_MapRead | WGPUBufferUsage_CopyDst,
  };
  WGPUBuffer readback = wgpuDeviceCreateBuffer(ctx->device, &desc);

  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(ctx->device, NULL);
  wgpuCommandEncoderCopyBufferToBuffer(encoder,
    src, src_offset,
    readback, 0,
    buf_size);

  WGPUCommandBuffer commandBuffer = wgpuCommandEncoderFinish(encoder, NULL);
  wgpuQueueSubmit(ctx->queue, 1, &commandBuffer);

  // TODO: Could we do an actual async mapping here if `sync` is false?
  WGPUMapAsyncStatus status =
    wgpu_map_buffer_sync(ctx->instance, readback, WGPUMapMode_Read, 0, buf_size);
  if (status != WGPUMapAsyncStatus_Success) {
    char size_str[64];
    wgpu_format_size(nbytes, size_str, sizeof(size_str));
    futhark_panic(-1,
      "WebGPU error in memcpy_gpu2host: Failed to map readback buffer\n"
      "  Provenance: %s\n"
      "  Status: %s (code %d)\n"
      "  Transfer size: %s\n"
      "  Source offset: %lld, Destination offset: %lld\n"
      "  Hint: Buffer mapping failed during device-to-host transfer.\n",
      provenance ? provenance : "unknown",
      wgpu_map_status_str(status), status,
      size_str,
      (long long)src_offset, (long long)dst_offset);
  }

  const void *mapped = wgpuBufferGetConstMappedRange(readback, 0, buf_size);
  if (mapped == NULL) {
    futhark_panic(-1,
      "WebGPU error in memcpy_gpu2host: Failed to get mapped buffer range\n"
      "  Provenance: %s\n"
      "  Hint: The buffer may not be properly mapped.\n",
      provenance ? provenance : "unknown");
  }
  memcpy(dst + dst_offset, mapped, nbytes);

  wgpuBufferUnmap(readback);
  wgpuBufferDestroy(readback);
  return FUTHARK_SUCCESS;
}

static int gpu_memcpy(struct futhark_context *ctx,
                      const char *provenance,
                      gpu_mem dst, int64_t dst_offset,
                      gpu_mem src, int64_t src_offset,
                      int64_t nbytes) {
  if (ctx->debugging) {
    char size_str[64];
    wgpu_format_size(nbytes, size_str, sizeof(size_str));
    fprintf(ctx->log, "[WebGPU DEBUG] Transfer device->device: %s (src_offset=%lld, dst_offset=%lld)\n",
            size_str, (long long)src_offset, (long long)dst_offset);
  }

  // Bound storage buffers and copy operations must have sizes multiple of 4.
  // Note that copying more than `nbytes` is memory-safe because we also pad all
  // buffers when allocating them.
  // It could however corrupt data if the copy is in the middle of the buffer,
  // like in host2gpu.
  int64_t copy_size = ((nbytes + 4 - 1) / 4) * 4;
  if (copy_size > nbytes) {
    // Potential for an issue if we're not at the end of the destination buffer.
    // Find its size to make sure.
    uint64_t dst_size = wgpuBufferGetSize(dst);
    if (dst_offset + copy_size != dst_size) {
      printf("gpu_memcpy: Potentially could corrupt data due to padding!\n");
      //futhark_panic(-1, "gpu_memcpy: Would corrupt data due to padding!\n");
    }
  }
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(ctx->device, NULL);

  if (dst == src) {
    printf("gpu_memcpy: Cannot memcpy to/from the same buffer. Copying to temporary buffer first.\n");
    // Allocate temporary buffer.
    gpu_mem tmp;
    gpu_alloc_actual(ctx, copy_size, &tmp);

    // Copy data to temporary buffer and then to the destination.
    wgpuCommandEncoderCopyBufferToBuffer(encoder,
      src, src_offset, tmp, 0, copy_size);
    wgpuCommandEncoderCopyBufferToBuffer(encoder,
      tmp, 0, dst, dst_offset, copy_size);
    WGPUCommandBuffer commandBuffer = wgpuCommandEncoderFinish(encoder, NULL);
    wgpuQueueSubmit(ctx->queue, 1, &commandBuffer);

    // Free the temporary buffer once we have finished copying.
    futhark_context_sync(ctx);
    gpu_free_actual(ctx, tmp);
  }
  else {
    wgpuCommandEncoderCopyBufferToBuffer(encoder,
      src, src_offset, dst, dst_offset, copy_size);
    WGPUCommandBuffer commandBuffer = wgpuCommandEncoderFinish(encoder, NULL);
    wgpuQueueSubmit(ctx->queue, 1, &commandBuffer);
  }

  return FUTHARK_SUCCESS;
}

static int gpu_launch_kernel(struct futhark_context* ctx,
                             gpu_kernel kernel, const char *name,
                             const char *provenance,
                             const int32_t grid[3],
                             const int32_t block[3],
                             unsigned int shared_mem_bytes,
                             int num_args,
                             void* args[num_args],
                             size_t args_sizes[num_args]) {
  struct wgpu_kernel_info *kernel_info = kernel->info;

  // Debug logging for kernel launch (similar to CUDA/OpenCL/HIP backends)
  int64_t time_start = 0, time_end = 0;
  if (ctx->debugging) {
    fprintf(ctx->log, "[WebGPU DEBUG] Launching kernel '%s'\n", name);
    fprintf(ctx->log, "[WebGPU DEBUG]   grid=[%d,%d,%d] workgroup=[%d,%d,%d]\n",
            grid[0], grid[1], grid[2], block[0], block[1], block[2]);
    fprintf(ctx->log, "[WebGPU DEBUG]   shared_memory=%u bytes, num_args=%d\n",
            shared_mem_bytes, num_args);
    if (provenance != NULL) {
      fprintf(ctx->log, "[WebGPU DEBUG]   provenance: %s\n", provenance);
    }
    time_start = get_wall_time();
  }

  if (num_args !=
      kernel_info->num_shared_mem_overrides
      + kernel_info->num_scalars
      + kernel_info->num_bindings
  ) {
    futhark_panic(-1,
      "WebGPU error in gpu_launch_kernel: Argument count mismatch for kernel '%s'\n"
      "  Expected: %zu args (shared_mem=%zu + scalars=%zu + bindings=%zu)\n"
      "  Received: %d args\n"
      "  Hint: This is an internal error - kernel metadata doesn't match invocation.\n",
      name,
      kernel_info->num_shared_mem_overrides + kernel_info->num_scalars + kernel_info->num_bindings,
      kernel_info->num_shared_mem_overrides,
      kernel_info->num_scalars,
      kernel_info->num_bindings,
      num_args);
  }

  int shared_mem_start = 0;
  int scalars_start = shared_mem_start + kernel_info->num_shared_mem_overrides;
  int mem_start = scalars_start + kernel_info->num_scalars;

  void *scalars = malloc(kernel_info->scalars_size);
  for (int i = 0; i < kernel_info->num_scalars; i++) {
    memcpy(scalars + kernel_info->scalar_offsets[i],
        args[scalars_start + i], args_sizes[scalars_start + i]);
  }

  WGPUBindGroupEntry *bg_entries = calloc(1 + kernel_info->num_bindings,
                                          sizeof(WGPUBindGroupEntry));
  for (int i = 0; i < kernel_info->num_bindings; i++) {
    WGPUBindGroupEntry *entry = &bg_entries[1 + i];
    entry->binding = kernel_info->binding_indices[i];
    entry->buffer = (gpu_mem) *((gpu_mem *)args[mem_start + i]);
    // In theory setting (offset, size) to (0, 0) should also work and mean
    // 'the entire buffer', but as of writing this, Firefox requires
    // specifying the size.
    entry->offset = 0;
    entry->size = wgpuBufferGetSize(entry->buffer);
  }

  wgpuQueueWriteBuffer(ctx->queue, kernel->scalars_buffer, 0,
                       scalars, kernel_info->scalars_size);

  WGPUBindGroupEntry *scalar_entry = bg_entries;
  scalar_entry->binding = kernel_info->scalars_binding;
  scalar_entry->buffer = kernel->scalars_buffer;
  scalar_entry->offset = 0;
  scalar_entry->size = kernel_info->scalars_size;

  WGPUBindGroupDescriptor bg_desc = {
    .layout = kernel->bind_group_layout,
    .entryCount = 1 + kernel_info->num_bindings,
    .entries = bg_entries,
  };
  WGPUBindGroup bg = wgpuDeviceCreateBindGroup(ctx->device, &bg_desc);
  if (bg == NULL) {
    futhark_panic(-1,
      "WebGPU error in gpu_launch_kernel: Failed to create bind group for kernel '%s'\n"
      "  Provenance: %s\n"
      "  Bindings count: %zu (plus scalars)\n"
      "  Hint: Check buffer bindings - a buffer may be invalid or destroyed.\n",
      name, provenance ? provenance : "unknown",
      kernel_info->num_bindings);
  }

  WGPUComputePipeline pipeline;
  if (kernel->static_pipeline) {
    pipeline = kernel->pipeline;
    if (pipeline == NULL) {
      futhark_panic(-1,
        "WebGPU error in gpu_launch_kernel: Static pipeline is NULL for kernel '%s'\n"
        "  Provenance: %s\n"
        "  Hint: Kernel may not have been properly initialized.\n",
        name, provenance ? provenance : "unknown");
    }
  } else {
    int const_entry_idx = kernel->const_entries_set;
    for (int i = 0; i < kernel_info->num_dynamic_block_dims; i++) {
      WGPUConstantEntry *entry = &kernel->const_entries[const_entry_idx];
      const_entry_idx++;
      entry->key = wgpu_str(kernel_info->dynamic_block_dim_names[i]);
      entry->value = (double) block[kernel_info->dynamic_block_dim_indices[i]];
    }
    for (int i = 0; i < kernel_info->num_shared_mem_overrides; i++) {
      WGPUConstantEntry *entry = &kernel->const_entries[const_entry_idx];
      const_entry_idx++;
      entry->key = wgpu_str(kernel_info->shared_mem_overrides[i]);
      entry->value = (double) *((int32_t *) args[shared_mem_start + i]);
    }

    WGPUComputePipelineDescriptor desc = {
      .layout = kernel->pipeline_layout,
      .compute = {
        .module = kernel->module,
        .entryPoint = wgpu_str(kernel_info->name),
        .constantCount = kernel_info->num_overrides,
        .constants = kernel->const_entries,
      }
    };
    pipeline = wgpuDeviceCreateComputePipeline(ctx->device, &desc);
    if (pipeline == NULL) {
      futhark_panic(-1,
        "WebGPU error in gpu_launch_kernel: Failed to create compute pipeline for kernel '%s'\n"
        "  Provenance: %s\n"
        "  Hint: Check shader compilation errors - the entry point or constants may be invalid.\n",
        name, provenance ? provenance : "unknown");
    }
  }

  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(ctx->device, NULL);
  if (encoder == NULL) {
    futhark_panic(-1,
      "WebGPU error in gpu_launch_kernel: Failed to create command encoder for kernel '%s'\n"
      "  Provenance: %s\n"
      "  Hint: The device may be lost or in an invalid state.\n",
      name, provenance ? provenance : "unknown");
  }

  WGPUComputePassEncoder pass_encoder
    = wgpuCommandEncoderBeginComputePass(encoder, NULL);
  if (pass_encoder == NULL) {
    futhark_panic(-1,
      "WebGPU error in gpu_launch_kernel: Failed to begin compute pass for kernel '%s'\n"
      "  Provenance: %s\n"
      "  Hint: Command encoder may be in an invalid state.\n",
      name, provenance ? provenance : "unknown");
  }
  wgpuComputePassEncoderSetPipeline(pass_encoder, pipeline);
  wgpuComputePassEncoderSetBindGroup(pass_encoder, 0, bg, 0, NULL);
  wgpuComputePassEncoderDispatchWorkgroups(pass_encoder,
                                           grid[0], grid[1], grid[2]);
  wgpuComputePassEncoderEnd(pass_encoder);

  WGPUCommandBuffer cmd_buffer = wgpuCommandEncoderFinish(encoder, NULL);
  wgpuQueueSubmit(ctx->queue, 1, &cmd_buffer);

  // Debug timing: synchronize and report execution time
  if (ctx->debugging) {
    futhark_context_sync(ctx);
    time_end = get_wall_time();
    long int time_diff = time_end - time_start;
    fprintf(ctx->log, "[WebGPU DEBUG]   runtime: %ldus\n", time_diff);
  }

  free(scalars);
  free(bg_entries);

  return FUTHARK_SUCCESS;
}

// End of backends/webgpu.h.
