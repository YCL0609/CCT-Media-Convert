// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { allowdExt, File, runSanjuuni } from './libs/index.js';

/**
 * 图片转换预处理
 * @async
 * @param {function({
 *   wait: Set<any>;
 *   processing: Set<any>,
 *   finish: Set<any>,
 *   ignore: Set<any>,
 * }): void} progressFunc 进度报告回调函数,调用时传入当前任务队列的实时状态深拷贝对象
 * @param {String[]|null} customList 自定义文件列表
 * @returns {Promise<boolean>} 返回一个 Promise。返回是否完成的`boolean`
 */
export async function imagePerProcess(progressFunc, customList) {
    if (!globalThis.LogG || !globalThis.SettingsG) return false;
    if (typeof progressFunc !== 'function') return false;

    // 构建待处理列表
    const rawList = new Set(SettingsG.type === 1
        ? File.scanFile(SettingsG.sep, SettingsG.input, allowdExt)
        : [SettingsG.input]);
    const files = (customList && customList?.length !== 0)
        ? new Set(customList.filter(e => rawList.has(e)))
        : rawList;
    if (files.size === 0) {
        LogG.warn('待处理列表为空');
        return true;
    }

    LogG.info('待处理列表:', [...files])

    // 构建工作列表
    const jobList = new Set([...files]);

    // Sanjuuni 转换
    const ok = await runSanjuuni(jobList, progressFunc);
    if (!ok) LogG.error('Sanjuuni 转换失败, 处理进程终止!');
    return ok
}