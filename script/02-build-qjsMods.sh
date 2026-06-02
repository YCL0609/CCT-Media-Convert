#!/usr/bin/env bash
set -euo pipefail

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

while IFS='=' read -r NAME FILE; do

    [[ -z "$NAME" ]] && continue
    [[ "$NAME" =~ ^# ]] && continue

    if [[ ! -f "$FILE" ]]; then
        echo "missing file: $FILE"
        exit 1
    fi

    echo "Processing: $FILE (alias: $NAME)"

    VAR="RES_${NAME//[^a-zA-Z0-9_]/_}"

    SIZE=$(wc -c < "$FILE")

    printf \
        "static const unsigned char %s[] = {\n" \
        "$VAR" \
        >> "$DATA_FILE"

    od \
        -An \
        -tx1 \
        -v \
        "$FILE" |
    tr -s ' ' '\n' |
    grep -E '^[0-9a-fA-F]{2}$' |
    awk '
    {
        printf("0x%s,", $1);

        count++;

        if (count % 16 == 0)
            printf("\n");
    }
    END {
        printf("\n");
    }
    ' >> "$DATA_FILE"

    printf \
        "};\n\n" \
        >> "$DATA_FILE"

    printf \
        "    { \"%s\", %s, %s },\n" \
        "$NAME" \
        "$VAR" \
        "$SIZE" \
        >> "$TABLE_FILE"

done < "$CONF"

awk \
    -v DATA="$DATA_FILE" \
    -v TABLE="$TABLE_FILE" '
{
    if ($0 ~ /\/\* @@RESOURCE_DATA@@ \*\//) {
        while ((getline line < DATA) > 0)
            print line;
        next;
    }

    if ($0 ~ /\/\* @@RESOURCE_TABLE@@ \*\//) {
        while ((getline line < TABLE) > 0)
            print line;
        next;
    }

    print;
}
' "$TEMPLATE" > "$OUTPUT"

echo "generated: $OUTPUT"