#!/usr/bin/env bash
set -euo pipefail

# 切换到项目根目录
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
cd "$ROOT"

TEMPLATE="src/qjs-modules/resources.c"
OUTPUT="dist/resources.c"
CONF="resources.conf"

mkdir -p dist

DATA_FILE="$(mktemp)"
TABLE_FILE="$(mktemp)"

cleanup() {
    rm -f "$DATA_FILE" "$TABLE_FILE"
}
trap cleanup EXIT

echo "==> 预构建 QuickJS 模块 ..."

if command -v xxd >/dev/null 2>&1; then
    HEX_DUMP="xxd_dump"
elif command -v hexdump >/dev/null 2>&1; then
    HEX_DUMP="hexdump_dump"
else
    echo "错误: 未找到 xxd 或 hexdump" >&2
    exit 1
fi

xxd_dump() {
    local file="$1" var="$2"
    xxd -i "$file" | sed "s/unsigned char.*/unsigned char ${var}[] = {/; s/};/};/"
}

hexdump_dump() {
    local file="$1" var="$2"
    printf "static const unsigned char %s[] = {\n" "$var"
    hexdump -v -e '16/1 "0x%02x, " "\n"' "$file" | sed 's/0x  ,//g; $s/,$//'
    printf "\n};\n\n"
}

# 读取配置文件
while IFS='=' read -r NAME FILE || [[ -n "$NAME" || -n "$FILE" ]]; do
    NAME="${NAME##*([[:space:]])}"; NAME="${NAME%%*([[:space:]])}"
    FILE="${FILE##*([[:space:]])}"; FILE="${FILE%%*([[:space:]])}"

    [[ -z "$NAME" ]] && continue
    [[ "$NAME" =~ ^# ]] && continue

    if [[ ! -f "$FILE" ]]; then
        echo "missing file: $FILE" >&2
        exit 1
    fi

    echo "Processing: $FILE (alias: $NAME)"

    VAR="RES_${NAME//[^a-zA-Z0-9_]/_}"
    SIZE=$(wc -c < "$FILE")

    if [ "$SIZE" -gt 0 ]; then
        $HEX_DUMP "$FILE" "$VAR" >> "$DATA_FILE"
    else
        printf "static const unsigned char %s[] = {};\n\n" "$VAR" >> "$DATA_FILE"
    fi

    # 2. 生成索引表数据
    printf "    { \"%s\", %s, %s },\n" "$NAME" "$VAR" "$SIZE" >> "$TABLE_FILE"

done < "$CONF"

awk -v DATA="$DATA_FILE" -v TABLE="$TABLE_FILE" '
{
    if ($0 ~ /\/\* @@RESOURCE_DATA@@ \*\//) {
        while ((getline line < DATA) > 0) print line;
        close(DATA);
        next;
    }
    if ($0 ~ /\/\* @@RESOURCE_TABLE@@ \*\//) {
        while ((getline line < TABLE) > 0) print line;
        close(TABLE);
        next;
    }
    print;
}
' "$TEMPLATE" > "$OUTPUT"

echo "generated: $OUTPUT"