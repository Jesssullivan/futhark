#!/usr/bin/env bash
# Run WebGPU E2E tests with xvfb for headless display
#
# xvfb-run provides a virtual X11 display needed by Chrome/WebGPU,
# even when using SwiftShader software rendering.
#
# Usage: ./tools/run_webgpu_tests.sh <compiled-webgpu-program>
#
# Example:
#   futhark webgpu --library tests/primitive/acos32.fut -o /tmp/test
#   ./tools/run_webgpu_tests.sh /tmp/test

set -e

PROGRAM="$1"
if [ -z "$PROGRAM" ]; then
    echo "Usage: $0 <compiled-webgpu-program>"
    echo ""
    echo "Example:"
    echo "  futhark webgpu --library tests/primitive/acos32.fut -o /tmp/test"
    echo "  $0 /tmp/test"
    exit 1
fi

# -a: auto-select display number to avoid conflicts
xvfb-run -a python tools/browser_test.py "$PROGRAM"
