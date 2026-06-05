/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Copyright (C) 2026 YCL */

#include <string.h>
#include "quickjs.h"

typedef struct {
    const char *name;
    const unsigned char *data;
    uint32_t len;
} ResourceItem;

/* @@RESOURCE_DATA@@ */

static const ResourceItem g_resources[] = {
    /* @@RESOURCE_TABLE@@ */
    { NULL, NULL, 0 }
};

static JSValue js_getSource(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv
) {
    const char *name;

    if (argc < 1) return JS_EXCEPTION;

    name = JS_ToCString(
        ctx,
        argv[0]
    );

    if (!name) return JS_EXCEPTION;
    for (int i = 0; g_resources[i].name; i++) {
        if (!strcmp(
            g_resources[i].name,
            name
        )) {
            JS_FreeCString(
                ctx,
                name
            );

            return JS_NewStringLen(
                ctx,
                (const char *) g_resources[i].data,
                g_resources[i].len
            );
        }
    }

    JS_FreeCString(
        ctx,
        name
    );

    return JS_UNDEFINED;
}

static const JSCFunctionListEntry funcs[] = {
    // js内部函数 getSource(id) 导出
    JS_CFUNC_DEF(
        "getSource",
        1,
        js_getSource
    ),
};

static int js_sources_init(
    JSContext *ctx,
    JSModuleDef *m
) {
    return JS_SetModuleExportList(
        ctx,
        m,
        funcs,
        sizeof(funcs) / sizeof(funcs[0])
    );
}

JSModuleDef *js_init_module_sources(
    JSContext *ctx,
    const char *module_name
) {
    JSModuleDef *m = JS_NewCModule(
        ctx,
        module_name,
        js_sources_init
    );

    if (!m) return NULL;

    JS_AddModuleExportList(
        ctx,
        m,
        funcs,
        sizeof(funcs) / sizeof(funcs[0])
    );

    return m;
}