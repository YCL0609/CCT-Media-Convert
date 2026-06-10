/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Copyright (C) 2026 YCL */

#define _CRT_SECURE_NO_WARNINGS

#include "mongoose.h"
#include "quickjs.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef JS_SHARED_LIBRARY
#define JS_INIT_MODULE js_init_module
#else
#define JS_INIT_MODULE js_init_module_mongoose
#endif

static struct mg_mgr mgr;
static JSContext *global_ctx = NULL;
static JSValue js_handler = JS_UNDEFINED;
static int mg_mgr_initialized = 0;

// 响应头构建
static char *build_response_headers(JSContext *ctx, JSValue headers_obj)
{
    if (!JS_IsObject(headers_obj))
    {
        return NULL;
    }

    JSPropertyEnum *props = NULL;
    uint32_t prop_count = 0;

    if (JS_GetOwnPropertyNames(ctx, &props, &prop_count, headers_obj, JS_GPN_STRING_MASK) < 0)
    {
        return NULL;
    }

    char *headers = NULL;
    size_t headers_len = 0;

    for (uint32_t i = 0; i < prop_count; i++)
    {
        JSAtom atom = props[i].atom;
        const char *key = JS_AtomToCString(ctx, atom);
        if (!key)
        {
            continue;
        }

        JSValue value_val = JS_GetProperty(ctx, headers_obj, atom);
        if (JS_IsException(value_val) || JS_IsUndefined(value_val) || JS_IsNull(value_val))
        {
            JS_FreeCString(ctx, key);
            JS_FreeValue(ctx, value_val);
            continue;
        }

        const char *value = JS_ToCString(ctx, value_val);
        if (value)
        {
            size_t key_len = strlen(key);
            size_t val_len = strlen(value);
            size_t needed = key_len + 2 + val_len + 2 + 1;

            char *new_headers = realloc(headers, headers_len + needed + 1);
            if (!new_headers)
            {
                if (headers)
                    free(headers);
                headers = NULL;

                JS_FreeCString(ctx, value);
                JS_FreeValue(ctx, value_val);
                JS_FreeCString(ctx, key);
                break;
            }

            headers = new_headers;

            memcpy(headers + headers_len, key, key_len);
            headers_len += key_len;

            headers[headers_len++] = ':';
            headers[headers_len++] = ' ';

            memcpy(headers + headers_len, value, val_len);
            headers_len += val_len;

            headers[headers_len++] = '\r';
            headers[headers_len++] = '\n';
            headers[headers_len] = '\0';

            JS_FreeCString(ctx, value);
        }

        JS_FreeValue(ctx, value_val);
        JS_FreeCString(ctx, key);
    }

    JS_FreePropertyEnum(ctx, props, prop_count);
    return headers;
}

static void fn(
    struct mg_connection *c,
    int ev,
    void *ev_data)
{
    if (ev != MG_EV_HTTP_MSG)
        return;

    struct mg_http_message *hm = (struct mg_http_message *)ev_data;

    if (!JS_IsFunction(global_ctx, js_handler))
    {
        mg_http_reply(
            c,
            500,
            "Content-Type: text/html\r\n",
            "<center><h1>500 Internal Server Error</h1></center><hr>No handler");
        return;
    }

    JSValue req = JS_NewObject(global_ctx);

    // 请求协议
    JS_SetPropertyStr(global_ctx, req, "method", JS_NewStringLen(global_ctx, hm->method.buf, hm->method.len));
    // 请求 URI
    JS_SetPropertyStr(global_ctx, req, "uri", JS_NewStringLen(global_ctx, hm->uri.buf, hm->uri.len));
    // URI 的查询参数
    JS_SetPropertyStr(global_ctx, req, "query", JS_NewStringLen(global_ctx, hm->query.buf, hm->query.len));
    // 请求体 (ArrayBuffer Copy)
    JSValue js_body_ab = JS_NewArrayBufferCopy(global_ctx, (const uint8_t *)hm->body.buf, hm->body.len);
    JS_SetPropertyStr(global_ctx, req, "body", js_body_ab);

    // 处理请求 headers
    JSValue req_headers = JS_NewObject(global_ctx);
    for (int i = 0; i < MG_MAX_HTTP_HEADERS; i++)
    {
        struct mg_str *name = &hm->headers[i].name;
        struct mg_str *value = &hm->headers[i].value;

        if (name->len == 0)
            break;
        char key[256];
        snprintf(key, sizeof(key), "%.*s", (int)name->len, name->buf);

        JS_SetPropertyStr(
            global_ctx,
            req_headers,
            key,
            JS_NewStringLen(global_ctx, value->buf, value->len));
    }
    JS_SetPropertyStr(global_ctx, req, "headers", req_headers);

    // 执行 JS 逻辑
    JSValue ret = JS_Call(global_ctx, js_handler, JS_UNDEFINED, 1, &req);
    JS_FreeValue(global_ctx, req);

    // JS 报错处理
    if (JS_IsException(ret))
    {
        JSValue exc = JS_GetException(global_ctx);
        const char *msg = JS_ToCString(global_ctx, exc);
        if (msg)
        {
            fprintf(stderr, "JS Exception: %s\n", msg);
            JS_FreeCString(global_ctx, msg);
        }
        JS_FreeValue(global_ctx, exc);
        JS_FreeValue(global_ctx, ret);

        mg_http_reply(
            c,
            500,
            "Content-Type: text/html\r\n",
            "<center><h1>500 Internal Server Error</h1></center><hr>JS Exception");
        return;
    }

    // 返回格式校验
    if (!JS_IsArray(ret))
    {
        JS_FreeValue(global_ctx, ret);
        mg_http_reply(
            c,
            502,
            "Content-Type: text/html\r\n",
            "<center><h1>502 Bad Gateway</h1></center><hr>Handler must return [code, header, body]");
        return;
    }

    // 状态码
    int http_code = 200;
    JSValue vcode = JS_GetPropertyUint32(global_ctx, ret, 0);
    if (JS_IsNumber(vcode))
    {
        JS_ToInt32(global_ctx, &http_code, vcode);
    }

    // 响应头
    JSValue vheaders = JS_GetPropertyUint32(global_ctx, ret, 1);
    char *headers = build_response_headers(global_ctx, vheaders);

    // 响应体
    JSValue vbody = JS_GetPropertyUint32(global_ctx, ret, 2);

    // 响应体
    size_t body_len = 0;
    int is_string = 0;
    uint8_t *body_ptr = JS_GetArrayBuffer(global_ctx, &body_len, vbody);

    if (!body_ptr)
    {
        // 如果提取 ArrayBuffer 失败，， 退化为字符串处理
        const char *str_body = JS_ToCString(global_ctx, vbody);
        if (str_body)
        {
            body_ptr = (uint8_t *)str_body;
            body_len = strlen(str_body);
            is_string = 1;
        }
    }

    // 发送响应头
    mg_printf(
        c,
        "HTTP/1.1 %d OK\r\n"
        "Content-Length: %lu\r\n"
        "%s\r\n",
        http_code,
        (unsigned long)body_len,
        headers ? headers : "");

    // 发送响应体
    if (body_len > 0 && body_ptr)
    {
        mg_send(c, body_ptr, body_len);
    }

    // 设置完成标志位
    c->is_resp = 0;

    // 资源释放
    if (headers)
    {
        free(headers);
    }

    if (is_string && body_ptr)
    {
        JS_FreeCString(global_ctx, (const char *)body_ptr);
    }

    JS_FreeValue(global_ctx, vbody);
    JS_FreeValue(global_ctx, vheaders);
    JS_FreeValue(global_ctx, vcode);
    JS_FreeValue(global_ctx, ret);
}

static JSValue js_serve(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (argc < 3)
    {
        return JS_ThrowTypeError(ctx, "Missing parameters (expected: isGlobal, port, handler)");
    }

    // 是否允许局域网访问
    int is_global = JS_ToBool(ctx, argv[0]);
    if (is_global < 0)
    {
        return JS_EXCEPTION;
    }

    // 端口
    int32_t port;
    if (JS_ToInt32(ctx, &port, argv[1]))
    {
        return JS_EXCEPTION;
    }

    // 处理函数
    if (!JS_IsFunction(ctx, argv[2]))
    {
        return JS_ThrowTypeError(ctx, "handler must be a function");
    }

    if (!JS_IsUndefined(js_handler))
    {
        JS_FreeValue(ctx, js_handler);
    }

    js_handler = JS_DupValue(ctx, argv[2]);
    global_ctx = ctx;

    mg_log_set(MG_LL_NONE);

    if (!mg_mgr_initialized)
    {
        mg_mgr_init(&mgr);
        mg_mgr_initialized = 1;
    }

    // 根据布尔值决定监听地址
    const char *host = is_global ? "0.0.0.0" : "127.0.0.1";
    char addr[64];
    snprintf(addr, sizeof(addr), "http://%s:%d", host, (int)port);

    if (!mg_http_listen(&mgr, addr, fn, NULL))
    {
        return JS_ThrowInternalError(ctx, "Http server listen failed");
    }

    return JS_UNDEFINED;
}

// 只需要导出 poll 函数
static JSValue js_poll(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    if (!mg_mgr_initialized) return JS_UNDEFINED;
    mg_mgr_poll(&mgr, 0); 
    return JS_UNDEFINED;
}

// 导出设置
static const JSCFunctionListEntry funcs[] = {
    JS_CFUNC_DEF("serve", 3, js_serve),
    JS_CFUNC_DEF("poll", 1, js_poll),
};

static int js_mongoose_init(
    JSContext *ctx,
    JSModuleDef *m)
{
    return JS_SetModuleExportList(ctx, m, funcs, sizeof(funcs) / sizeof(funcs[0]));
}

JSModuleDef *JS_INIT_MODULE(
    JSContext *ctx,
    const char *module_name)
{
    JSModuleDef *m = JS_NewCModule(ctx, module_name, js_mongoose_init);
    if (!m)
        return NULL;
    JS_AddModuleExportList(ctx, m, funcs, sizeof(funcs) / sizeof(funcs[0]));
    return m;
}