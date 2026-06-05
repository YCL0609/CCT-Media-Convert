#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
cd "$ROOT"

DIST_DIR="$ROOT/dist/quickjs"
mkdir -p "$DIST_DIR"

get_jobs() {
  if command -v nproc >/dev/null 2>&1; then
    nproc
  elif command -v getconf >/dev/null 2>&1; then
    getconf _NPROCESSORS_ONLN
  else
    echo 1
  fi
}

configure_and_build() {
  local build_dir="$1"
  shift
  local cmake_args=("$@")
  local abs_build_dir="$DIST_DIR/$build_dir"

  mkdir -p "$abs_build_dir"
  cd "$abs_build_dir"

  cmake "$ROOT/deps/quickjs" "${cmake_args[@]}"

  cmake --build . --target qjsc -- -j "$(get_jobs)"

  cd "$ROOT"
}

echo "==> 构建 Linux qjsc ..."
configure_and_build "build-linux" \
  -DQJS_BUILD_CLI_STATIC=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=musl-gcc \
  -DCMAKE_C_FLAGS="-O2 -ffunction-sections -fdata-sections" \
  -DCMAKE_EXE_LINKER_FLAGS="-Wl,--gc-sections"

echo "==> 构建 Windows qjsc.exe ..."
configure_and_build "build-win" \
  -DCMAKE_SYSTEM_NAME=Windows \
  -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc \
  -DQJS_BUILD_CLI_STATIC=ON \
  -DCMAKE_BUILD_TYPE=Release
