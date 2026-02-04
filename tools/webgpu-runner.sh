#!/bin/bash
# Runner script for futhark test --backend=webgpu
# Wraps browser_test.py with xvfb-run for headless execution
#
# This script is used by `futhark test --runner=./tools/webgpu-runner.sh`
# to run WebGPU tests in a headless browser via xvfb-run.
#
# Requirements:
# - xvfb (virtual framebuffer)
# - Chrome/Chromium with WebGPU support
# - Python with aiohttp and selenium
#
# The -a flag tells xvfb-run to automatically select a display number

exec xvfb-run -a python tools/browser_test.py "$@"
