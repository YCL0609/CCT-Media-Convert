// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import * as std from 'qjs:std';

/** 允许的文件后缀名 */
const allowdExt = {
    image: ['.jpg', '.png', '.jpeg'],
    video: ['.mp4', '.mkv', '.avi', '.mov'],
}

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
 * 命令行参数解析器
 * @param {string[]} args 要解析的参数数组
 */
function cmdLineHandle(args) {
    const regx = /^\\d+x\d+\$/;
    // 分离原始数字参数
    function sepNum(raw, range) {
        if (!regx.test(raw)) return [-1, -1]
        return raw.split('x')
    }

    let type = 0; // 1图片, 2视频 
    let mode = 0; // 1文件夹, 2文件
    const cfg = {
        thread: 2,
        screen: {},
        input: null,
        output: null,
        logDir: null,
        configPath: null,
        sanjuuniArgs: null,
    }
    // 从1索引开始遍历去除自身路径
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];

        // 处理类型
        if (arg === '-I' || arg === '--image') {
            if (type !== 0) errorExit('检测到互斥参数:' + arg);
            type = 1;
        } else if (arg === '-V' || arg === '--video') {
            if (type !== 0) errorExit('检测到互斥参数:' + arg);
            type = 2;
        }

        // 处理模式
        else if (arg === '-d' || arg === '--dir') {
            if (mode !== 0) errorExit('检测到互斥参数:' + arg);
            mode = 1;
        } else if (arg === '-f' || arg === '--file') {
            if (mode !== 0) errorExit('检测到互斥参数:' + arg);
            mode = 2;
        }

        // 输入输出路径
        else if (arg === '-i' || arg === '--input') {
            const path = args[++i];
            if (path === void 0) errorExit('输入参数为空');
            cfg.input = path;
        } else if (arg === '-o' || arg === '--output') {
            const path = args[++i];
            if (path === void 0) errorExit('输出参数为空')
            cfg.output = path;
        }

        // 配置文件路径
        else if (arg === '-c' || arg === '--config') {
            const path = args[++i];
            if (path === void 0) errorExit('配置文件参数为空');
            cfg.configPath = path;
        }

        // 日志文件路径
        else if (arg === '-l' || arg === '--logDir') {
            const path = args[++i];
            if (path === void 0) errorExit('日志文件夹参数为空');
            cfg.logDir = (path !== 'null') ? path : '';
        }

        // 矩阵大小解析
        else if (arg.startsWith('-M')) {
            const [w, h] = sepNum(arg.slice(2));
            if (w < 0 || h < 0) errorExit('尺寸参数错误:' + arg)
            if (w !== 0) cfg.screen.width = Number(w);
            if (h !== 0) cfg.screenscreen.height = Number(h);
        } else if (arg.startsWith('--matrix=')) {
            const [w, h] = sepNum(arg.split('=')[1]);
            if (w < 0 || h < 0) errorExit('尺寸参数错误:' + arg)
            if (w !== 0) cfg.screen.width = Number(w);
            if (h !== 0) cfg.screen.height = Number(h);
        }

        // 单元大小解析
        else if (arg.startsWith('-S')) {
            const [w, h] = sepNum(arg.slice(2));
            if (w < 0 || h < 0) errorExit('尺寸参数错误:' + arg)
            if (w !== 0) scrcfg.screeneen.cellWidth = Number(w);
            if (h !== 0) cfg.screen.cellHeight = Number(h);
        } else if (arg.startsWith('--cellsize=')) {
            const [w, h] = sepNum(arg.split('=')[1]);
            if (w < 0 || h < 0) errorExit('尺寸参数错误:' + arg)
            if (w !== 0) cfg.screen.cellWidth = Number(w);
            if (h !== 0) cfg.screen.cellHeight = Number(h);
        }

        // 线程计数解析
        else if (arg.startsWith('-t')) {
            const count = Number(arg.slice(2));
            if (isNaN(count)) errorExit('线程参数错误:' + arg);
            cfg.thread = count;
        } else if (arg.startsWith('--thread=')) {
            const count = Number(arg.split('=')[1]);
            if (isNaN(count)) errorExit('线程参数错误:' + arg);
            cfg.thread = count;
        }

        // 额外参数解析
        else if (arg.startsWith('--sanjuuniArgs=')) {
            const raw = arg.split('=')[1].trim();
            const rawSign = raw.replace(/^['"]|['"]$/g, '')
            const sign = rawSign.split(' ');
            if (sign.length === 0) errorExit('sanjuuni 参数为空:', arg);
            cfg.sanjuuniArgs = sign;
        }
    }

    return {
        isDir: (mode !== 0) ? (mode === 1) : true,
        isImage: (type !== 0) ? (type === 1) : true,
        ...cfg,
    }
}



export {
    joinPath,
    allowdExt,
    jsonCheck,
    cmdLineHandle,
}