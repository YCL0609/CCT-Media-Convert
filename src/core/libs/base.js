// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import * as os from 'qjs:os';
import * as std from 'qjs:std';
import * as winproc from 'cctmc:winproc';
import { LogG } from '../main.js';

/** 允许的文件后缀名 */
const allowdExt = ['.jpg', '.png', '.jpeg'];

/**
 * 文件路径拼接函数
 * @param {string} sep 路径分隔符
 * @param {...string} parts 要拼接的路径参数
 * @returns {string} 拼接好的标准本地路径
 */
function joinPath(sep, ...parts) {
    // 初步过滤
    const joined = parts
        .filter(p => p && typeof p === 'string')
        .join(sep);

    // 统一分隔符
    const unified = joined.replace(/[\\/]+/g, sep);

    // 类 Unix 系统双斜杠开头兼容
    if (sep === '/' && unified.startsWith('//')) {
        return unified.slice(1);
    }

    return unified;
}

/**
* 递归校验配置对象并补全默认值
* @template T
* @param {*} cfg 待校验配置
* @param {T} defaultCfg 默认配置
* @returns {T} 校验后的配置对象
*/
function jsonCheck(cfg, defaultCfg) {
    if (cfg == null) return defaultCfg;

    // 基础类型
    if (typeof cfg !== 'object') {
        return typeof cfg === typeof defaultCfg
            ? cfg
            : defaultCfg;
    }

    // 数组
    if (Array.isArray(cfg)) {
        return Array.isArray(defaultCfg)
            ? cfg
            : defaultCfg;
    }

    // default 不是 object
    if (
        defaultCfg == null ||
        typeof defaultCfg !== 'object' ||
        Array.isArray(defaultCfg)
    ) {
        return defaultCfg;
    }

    // 子项检查
    const result = {};
    for (const key of Object.keys(defaultCfg)) {
        result[key] = jsonCheck(cfg[key], defaultCfg[key]);
    }

    return result;
}

/**
 * 将 ArrayBuffer 安全、无乱码地转换为 UTF-8 字符串
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
function bufferToString(buffer) {
    if (!buffer || buffer.byteLength === 0) return "";

    // 优先：如果环境支持 TextDecoder，直接使用原生高性能解码
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder("utf-8").decode(buffer);
    }

    // 备选：纯 JavaScript 健壮的 UTF-8 解码状态机（防截断、防栈溢出）
    const array = new Uint8Array(buffer);
    let out = "", i = 0, len = array.length;

    while (i < len) {
        let c = array[i++];
        switch (c >> 4) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx : 标准 ASCII (英文、数字、标点)
                out += String.fromCharCode(c);
                break;
            case 12: case 13:
                // 110xxxxx 10xxxxxx : 双字节字符
                out += String.fromCharCode(((c & 0x1F) << 6) | (array[i++] & 0x3F));
                break;
            case 14:
                // 1110xxxx 10xxxxxx 10xxxxxx : 三字节字符
                out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((array[i++] & 0x3F) << 6) |
                    ((array[i++] & 0x3F) << 0));
                break;
            case 15:
                // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx : 四字节字符
                // 转换为 JavaScript 的代理对 (Surrogate Pairs) 存储
                let cp = ((c & 0x07) << 18) | ((array[i++] & 0x3F) << 12) | ((array[i++] & 0x3F) << 6) | (array[i++] & 0x3F);
                cp -= 0x10000;
                out += String.fromCharCode((cp >> 10) | 0xD800, (cp & 0x3FF) | 0xDC00);
                break;
        }
    }
    return out;
}

/** 子进程列表 */
const childPIDs = new Set();

/** 结束所有子进程
 * @param {boolean} [isTERM=false] (win端无效) 是否使用`SIGTERM`而不是`SIGKILL`
 * @returns {void}
 */
function _killChild(isTERM = false) {
    for (let i = 0; i < childPIDs.size; i++) {
        const pid = childPIDs.values().next().value;
        childPIDs.delete(pid);
        if (os.platform === 'win32') {
            winproc.kill(pid);
        } else {
            if (isTERM) {
                os.kill(pid, os.SIGTERM);
            } else {
                os.kill(pid, 9); // SIGKILL
            }
        }
    }
}

/**
 * 错误退出
 * @param {string} text 提示信息
 * @param {number|string|null} id errno代码
 * @returns {void}
 */
function errorExit(text, id) {
    if (id !== void 0) text += ' - Code: ' + id;
    const txt = '[FAIL] ' + String(text) + '\n';
    _killChild();

    std.err.puts(txt);
    std.err.flush();
    if (LogG?.logFd) {
        LogG.logFd?.puts(txt);
        LogG.logFd?.flush();
    }
    LogG?.closeFd();

    std.exit(1);
}

/**
 * 正常退出
 * @returns {void}
 */
function exitApp() {
    _killChild(true);
    LogG?.closeFd();
    std.exit(0);
}


export {
    exitApp,
    joinPath,
    errorExit,
    jsonCheck,
    bufferToString,
    allowdExt,
    childPIDs,
}