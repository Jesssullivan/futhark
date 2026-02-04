#!/bin/bash
# Runner script for futhark test --backend=webgpu
# Wraps browser_test.py with xvfb-run for headless execution

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

exec xvfb-run -a python "$REPO_ROOT/tools/browser_test.py" "$@"
