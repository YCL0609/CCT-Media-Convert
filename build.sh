#!/bin/bash
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")"; pwd)"
mkdir -p out 2>/dev/null
set -e

cp picture.js out/main.js

echo "(1/5) 处理嵌入资源 ..."
LUA_CONTENT=$(echo -n "const initLua=\`"; tr '\n' ' ' < init.lua | sed 's/  */ /g'; echo -n "\`;")
sed -i "s|^.*@@@@.*$|$LUA_CONTENT|" out/main.js

HELP_CONTENT=$(awk '{
    gsub(/\\/, "\\\\"); 
    gsub(/&/, "\\&"); 
    gsub(/\//, "\\/"); 
    printf "%s\\n", $0
}' picture-help.txt)

# 执行替换
sed -i "s/####/$HELP_CONTENT/g" out/main.js

echo "(2/5) QuickJS 编译 ..."
./quickjs/build-linux/qjsc -m -e -o out/main.c out/main.js

echo "(3/5) 注入 Windows 控制台字体乱码补丁 ..."
sed -i '1i #ifdef _WIN32\n#include <windows.h>\n#endif' out/main.c
sed -i '/int main(int argc, char \*\*argv)/!b;n;a #ifdef _WIN32\n    SetConsoleOutputCP(65001);\n#endif' out/main.c

echo "(4/5) 构建 Linux 版本 ..."
musl-gcc out/main.c \
    -Os -s \
    -ffunction-sections -fdata-sections \
    -I ./quickjs \
    -L ./quickjs/build-linux \
    -Wl,--gc-sections \
    -static \
    -lqjs-libc -lqjs -lm -ldl -lpthread \
    -o out/linux

echo "(5/5) 构建 Windows 版本 ..."
x86_64-w64-mingw32-gcc out/main.c \
    -Os -s \
    -ffunction-sections -fdata-sections \
    -I ./quickjs \
    -L ./quickjs/build-win \
    -Wl,--gc-sections \
    -static \
    -lqjs-libc -lqjs -lm -lws2_32 -lwinmm -lpthread \
    -o out/windows.exe

chmod +x out/linux
ls -lh --color=tty out