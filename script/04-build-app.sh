#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
# SPDX-License-Identifier: GPL-2.0-or-later

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
cd "$ROOT"

DIST="$ROOT/dist"
DEPS="$ROOT/deps"
SRC="$ROOT/src"

# 通用编译选项
COMMON_CFLAGS="-Os -flto -ffunction-sections -fdata-sections"
COMMON_LDFLAGS="-Wl,--gc-sections -s"
INCLUDES="-I$DEPS/quickjs -I$DEPS/mongoose"

# 公共源文件列表
SRCS=(
    "$DIST/core.c"
    "$DIST/resources.c"
    "$SRC/qjs-modules/mini-httpd.c"
    "$SRC/qjs-modules/winProc.c"
    "$DEPS/mongoose/mongoose.c"
)

echo "==> 构建 Linux 版本 ..."
musl-gcc $COMMON_CFLAGS $INCLUDES "${SRCS[@]}" \
    "$DIST/quickjs/build-linux/libqjs.a" \
    "$DIST/quickjs/build-linux/libqjs-libc.a" \
    -o "$DIST/app-linux" \
    $COMMON_LDFLAGS -static -lm
    
file "$DIST/app-linux"

echo "==> 构建 Windows 版本 ..."
x86_64-w64-mingw32-gcc $COMMON_CFLAGS $INCLUDES "${SRCS[@]}" \
    "$DIST/quickjs/build-win/libqjs.a" \
    "$DIST/quickjs/build-win/libqjs-libc.a" \
    -o "$DIST/app-win.exe" \
    $COMMON_LDFLAGS -static -lws2_32 -lm

file "$DIST/app-win.exe"