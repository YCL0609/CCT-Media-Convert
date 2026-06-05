#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
cd "$ROOT"

echo "==> 构建 Linux 版本 ..."
musl-gcc -Os -flto -static \
    -ffunction-sections -fdata-sections \
    -I"$ROOT/deps/quickjs" \
    -I"$ROOT/deps/mongoose" \
    "$ROOT/dist/core.c" "$ROOT/dist/resources.c" \
    "$ROOT/src/qjs-modules/mini-httpd.c" "$ROOT/src/qjs-modules/winProc.c" \
    "$ROOT/dist/quickjs/build-linux/libqjs.a" "$ROOT/dist/quickjs/build-linux/libqjs-libc.a" \
    -o "$ROOT/dist/app-linux" \
    -Wl,--gc-sections \
    -lm -s
file "$ROOT/dist/app-linux"

echo "==> 构建 Windows 版本 ..."
x86_64-w64-mingw32-gcc -Os -flto -static \
    -ffunction-sections -fdata-sections \
    -I"$ROOT/deps/quickjs" \
    -I"$ROOT/deps/mongoose" \
    "$ROOT/dist/core.c" "$ROOT/dist/resources.c" \
    "$ROOT/src/qjs-modules/mini-httpd.c" "$ROOT/src/qjs-modules/winProc.c" \
    "$ROOT/dist/quickjs/build-win/libqjs.a" "$ROOT/dist/quickjs/build-win/libqjs-libc.a" \
    -o "$ROOT/dist/app-win.exe" \
    -Wl,--gc-sections \
    -lws2_32 -lm -s
file "$ROOT/dist/app-win.exe"