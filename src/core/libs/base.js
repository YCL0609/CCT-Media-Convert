// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import * as os from 'qjs:os';
import * as std from 'qjs:std';
import * as winproc from 'cctmc:winproc';

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
    if (globalThis.LogG) {
        if (LogG?.logFd) {
            LogG.logFd?.puts(txt);
            LogG.logFd?.flush();
        }
        LogG?.closeFd();
    }

    std.exit(1);
}

/**
 * 正常退出
 * @returns {void}
 */
function exitApp() {
    _killChild(true);
    if (globalThis.LogG) LogG.closeFd();
    std.exit(0);
}


export {
    exitApp,
    joinPath,
    errorExit,
    jsonCheck,
    allowdExt,
    childPIDs,
}