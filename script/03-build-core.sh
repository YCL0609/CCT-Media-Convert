#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
cd "$ROOT"

echo "==> Rollup 打包 ..."
npx rollup -c "$ROOT/src/core/rollup.config.js"

echo "==> qjsc 编译 ..."
./dist/quickjs/build-linux/qjsc \
    -M cctmc:sources,sources \
    -M cctmc:mininet,mongoose \
    -M cctmc:winproc,winproc \
    -e -o ./dist/core.c \
    "$ROOT/dist/core.js"
ls -l "$ROOT/dist/core.c"

echo "==> Windows 控制台乱码修复补丁注入 ..."
sed -i '1i\
#ifdef _WIN32\
#include <windows.h>\
#endif\
' "$ROOT/dist/core.c"
sed -i '/int main(int argc, char \*\*argv)/{
N
s/int main(int argc, char \*\*argv)\n{/int main(int argc, char **argv)\n{\n#ifdef _WIN32\n    SetConsoleCP(CP_UTF8);\n    SetConsoleOutputCP(CP_UTF8);\n#endif/
}' "$ROOT/dist/core.c"
echo "Success!"