// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

/** 缓存标头 */
const cacheCtrl = {
    no: 'no-store, no-cache, must-revalidate, max-age=0',
    yes: 'private, max-age=31536000',
}

/** http状态码响应 */
const code = {
    /**
     * 200 OK + JSON
     * @param {object} json 要返回的json对象
     */
    _200Json(json) {
        return [200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': cacheCtrl.no,
        }, JSON.stringify(json ?? {})]
    },

    /**
     * 200 OK + ArrayBuffer
     * @param {string} type Content-Type
     * @param {ArrayBuffer} body 要发送的数据
     * @returns 
     */
    _200Buffer(type, body) {
        return [200, {
            'content-type': type ?? 'application/octet-stream',
            'cache-control': cacheCtrl.no,
        }, body]
    },

    /** 201 Created */
    _201() {
        return [204, {
            'cache-control': cacheCtrl.no,
        }, '']
    },

    /** 204 No Content */
    _204() {
        return [204, {
            'cache-control': cacheCtrl.no,
        }, '']
    },

    /**
     * 400 Bad Request
     * @param {string} detal 错误信息
     * @returns 
     */
    _400(detal) {
        return [400, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': cacheCtrl.no,
        }, JSON.stringify({ message: detal })]
    },

    /** 403 Forbidden */
    _403() {
        return [403, {
            'content-type': 'text/html',
            'cache-control': cacheCtrl.no,
        }, '<center><h1>403 Forbidden</h1></center><hr>']
    },

    /** 404 Not Found */
    _404() {
        return [404,
            {
                'content-type': 'text/html',
                'cache-control': cacheCtrl.yes,
            },
            '<center><h1>404 Not Found</h1></center><hr>'
        ]
    },

    /** 405 Method Not Allowed
     * @param {string} method 允许的协议
     */
    _405(method) {
        return [405,
            { allow: method, 'content-type': 'text/html' },
            `<center><h1>405 Method Not Allowed</h1></center><hr>This path only allows ${method} request methods!`
        ]
    },

    /**
     * 500 Internal Server Error
     * @param {string} detal 错误信息
     * @returns 
     */
    _500(detal) {
        return [500, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': cacheCtrl.no,
        }, JSON.stringify({ message: detal })]
    },

    /** 503 Service Unavailable */
    _503() {
        return [500, {
            'retry-after': '60',
            'cache-control': cacheCtrl.no,
        }, JSON.stringify({ message: detal })]
    },
}

/**
 * 解析并校验路径
 * @param {string} base64 要验证的路径base64
 * @returns {string[]} 验证后的路径数组
 */
function verifyPath(base64) {

    // 无效的 base64 输入
    if (!base64 || typeof base64 !== 'string') {
        throw new Error("Invalid base64 input");
    }

    let pathList;

    try {
        const rawStr = atob(base64);

        // 防止乱码
        const jsonStr = decodeURIComponent(
            Array.from(rawStr)
                .map(c =>
                    '%' +
                    ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                )
                .join('')
        );

        pathList = JSON.parse(jsonStr);

    } catch {
        // Base64 解码或 JSON 解析失败
        throw new Error(
            "Base64 decode or JSON parse failed"
        );
    }

    // 解析后的结果不是数组
    if (!Array.isArray(pathList)) {
        throw new Error(
            "Security Risk: Input is not an array"
        );
    }

    // 路径数组不能为空
    if (pathList.length === 0) {
        throw new Error(
            "Security Risk: Empty path"
        );
    }

    // 路径数组长度超过限制
    if (pathList.length > 255) {
        throw new Error(
            `Security Risk: pathList too long -> ${pathList.length}`
        );
    }

    // 要允许中文添加: \u4e00-\u9fa5
    const segmentRegex = /^[a-zA-Z0-9_.-]+$/;

    for (const segment of pathList) {

        // 路径段类型无效
        if (typeof segment !== 'string') {
            throw new Error(
                "Security Risk: Invalid segment type"
            );
        }

        // 路径段不能为空
        if (segment.length === 0) {
            throw new Error(
                "Security Risk: Empty segment"
            );
        }

        // 路径段长度超过限制
        if (segment.length > 255) {
            throw new Error(
                `Security Risk: Segment too long -> ${segment}`
            );
        }

        // 检测到路径穿越
        if (segment === '.' || segment === '..') {
            throw new Error(
                "Security Risk: Path traversal detected"
            );
        }

        // 路径段包含非法字符
        if (!segmentRegex.test(segment)) {
            throw new Error(
                `Security Risk: Invalid path segment -> ${segment}`
            );
        }
    }

    return pathList;
}
export {
    code,
    cacheCtrl,
    verifyPath,
}