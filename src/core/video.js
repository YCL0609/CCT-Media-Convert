// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { allowdExt, File, joinPath, Log, Settings, runFfmpeg, runSanjuuni, errorExit } from './libs/index.js';

/**
 * 图片转换预处理
 * @async
 * @param {function(jobList)} progressFuncF ffmpeg 进度报告回调函数,调用时传入当前任务队列的实时状态深拷贝对象
 * @param {function(jobList)} progressFuncS sanjuuni 进度报告回调函数,调用时传入当前任务队列的实时状态深拷贝对象
 * @param {String[]|null} customList 自定义文件列表
 * @returns {Promise<boolean>} 返回一个 Promise。返回是否完成的`boolean`
 */
export async function videoPerProcess(progressFuncF = () => { }, progressFuncS = () => { }, customList) {
    print('ccc')
    if (typeof progressFuncF !== 'function' || typeof progressFuncS !== 'function') {
        return false
    };
    const cfg = Settings.get();

    // 构建待处理列表
    const rawList = new Set(cfg.isDir
        ? File.scanFile(cfg.input, allowdExt.video)
        : [cfg.input]);
    const files = (customList && customList?.length !== 0)
        ? new Set(customList.filter(e => rawList.has(e)))
        : rawList;
    if (files.size === 0) {
        Log.warn('[Video]','待处理列表为空');
        return true;
    }

    // 构建工作列表
    const jobList = new Set([...files].map(item => ({ name: item, dir: '' })));

    // ffmpeg 转换
    const fOK = await runFfmpeg(files, progressFuncF);
    if (!fOK) {
        Log.error('ffmpeg 转换失败, 处理进程终止!');
        return false;
    }

    // 遍历添加切片文件
    let newFiles = new Set();
    while (jobList.size > 0) {
        const job = jobList.values().next().value;
        if (typeof job.name !== 'string' && !job.name.trim()) continue;
        const ext = job.name.split('.').pop().toLowerCase();
        const outDir = joinPath(cfg.sep, cfg.output, job.name);
        const list = File.scanFile(outDir, ['.' + ext]);
        list.map(item => newFiles.add({ name: item, dir: job.name }));
    }

    // Sanjuuni 转换
    const sOK = await runSanjuuni(newFiles, progressFuncS);
    if (!sOK) Log.error('Sanjuuni 转换失败, 处理进程终止!');
    return sOK
}