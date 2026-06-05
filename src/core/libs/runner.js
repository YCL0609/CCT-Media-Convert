// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { File, Log } from './file.js';
import { joinPath } from './base.js';
import * as winproc from 'cctmc:winproc';
import * as os from 'qjs:os';

// 活跃子进程集合
const childPIDs = new Set();

/**
 * 异步执行程序并重定向输出到文件
 * @param {String[]} args 要执行的程序
 * @param {function|null} signFunc 退出信号监测函数
 * @returns {Promise<number>} 程序退出码
 */
async function _execToLog(args, signFunc) {
    const doSign = typeof signFunc === 'function';
    let endCode = null;

    // 执行程序
    let pid;
    if (os.platform === 'win32') {
        const proc = winproc.exec(args, LogG.execPath);
        const pid = proc.pid;
        proc.then(code => endCode = code);
    } else {
        pid = os.exec(args, {
            block: false,
            stdout: LogG.execFd,
            stderr: LogG.execFd,
        });
    }

    // 记录子进程
    childPIDs.add(pid);

    if (doSign) {
        // 等待程序结束或信号
        while (true) {
            if (os.platform === 'win32') {
                // 程序主动结束
                if (endCode !== null) {
                    childPIDs.delete(pid);
                    return endCode
                }

                // 终止信号触发
                if (signFunc()) {
                    winproc.kill(pid);
                    childPIDs.delete(pid);
                    return -1;
                }
            } else {
                const [ret, status] = os.waitpid(pid, os.WNOHANG);

                // 程序主动结束
                if (ret === pid) {
                    childPIDs.delete(pid);
                    return status
                }

                // 终止信号触发
                if (signFunc()) {
                    os.kill(pid, os.SIGTERM);
                    childPIDs.delete(pid);
                    return -1;
                }
            }

            await os.sleepAsync(500);
        }
    } else {
        // 等待程序结束
        if (os.platform === 'win32') {
            while (true) {
                if (endCode !== null) {
                    childPIDs.delete(pid);
                    return endCode;
                }
                await os.sleepAsync(500);
            }
        } else {
            const [_, status] = os.waitpid(pid, 0);
            childPIDs.delete(pid);
            return status;
        }
    }
}
/**
 * 通用多线程任务执行器
 * @async
 * @param {object} options 选项参数对象
 * @param {Set} options.jobs 工作集合
 * @param {number} options.thread 并发线程
 * @param {function({
 *   wait: Set<any>;
 *   processing: Set<any>,
 *   finish: Set<any>,
 *   ignore: Set<any>,
 * }): void} options.progressFunc 进度汇报函数
 * @param {function(context): Promise<{
 *   ok: boolean,
 *   args: string[]
 * }>} options.perRun 预运行函数
 * @returns {Promise<boolean>}
 */
async function _runMultiThreadJobs({
    jobs,
    thread,
    progressFunc,
    perRun,
}) {
    if (!jobs || typeof progressFunc !== 'function') return false;
    if (jobs.size === 0) return true;

    // 工作列表构建
    const jobList = {
        wait: new Set(jobs),
        processing: new Set(),
        finish: new Set(),
        ignore: new Set()
    };

    let stopSign = false; // 全局停止信号
    let setLock = Promise.resolve(); // 全局取工作并发锁

    // 进度报告函数构建
    const report = () => progressFunc({
        wait: [...jobList.wait],
        processing: [...jobList.processing],
        finish: [...jobList.finish],
        ignore: [...jobList.ignore]
    });

    /**
     * 工作线程
     * @param {number} workerId 线程ID
     */
    async function doJob(workerId) {
        if (stopSign || jobList.wait.size === 0) return;

        // 取任务
        const newLock = setLock.then(() => {
            let job = null;

            while (jobList.wait.size > 0) {
                const rawJob = jobList.wait.values().next().value;
                jobList.wait.delete(rawJob);

                // 任务合规性校验
                if (
                    !rawJob ||
                    (typeof rawJob === 'string' && !rawJob.trim()) ||
                    jobList.processing.has(rawJob) ||
                    jobList.finish.has(rawJob) ||
                    jobList.ignore.has(rawJob)
                ) {
                    LogG.debug(`[线程${workerId}] D 任务合规性校验不通过(跳过):`, rawJob);
                    continue;
                }

                job = rawJob;
                jobList.processing.add(job);
                break;
            }

            return job;
        });

        // 释放锁
        setLock = newLock.then(() => { });

        // 运行任务
        const hasMore = await newLock.then(async job => {
            if (!job) return false;

            let code;
            try {
                // 执行预启动函数
                const data = await perRun({
                    workerId,
                    job,
                    jobList,
                    report,
                });
                if (!data.ok) return true; // 静默失败跳转到下一个任务
                LogG.info(`[线程${workerId}] I 开始转换:`, job);

                // 外部程序调用
                code = await _execToLog(data.args, () => stopSign);
            } catch (err) {
                stopSign = true;
                jobList.processing.delete(job);
                jobList.ignore.add(job);
                LogG.error(`[线程${workerId}] E 启动外部程序失败:`, (err?.message || String(err)));
                return false;
            }

            if (code === 0) {
                // 正常退出
                jobList.processing.delete(job);
                jobList.finish.add(job);
                LogG.info(`[线程${workerId}] S 转换成功:`, job);
            } else {
                // 错误退出处理
                stopSign = true;
                jobList.processing.delete(job);
                jobList.ignore.add(job);
                LogG.error(`[线程${workerId}] E 执行失败, 错误码:`, code);
            }

            report();
            return code === 0;
        });

        if (hasMore && !stopSign) return await doJob(workerId);
    }


    // 构建线程列表
    const workers = [];
    for (let i = 1; i <= thread; i++) {
        workers.push(doJob(i));
    }
    report(); // 初始化进度报告

    await Promise.all(workers);
    return !stopSign;
}

/**
 * 多线程异步 Sanjuuni 转换
 * @async
 * @param {Set} jobs - 要执行的初始集合
 * @param {function({
 *   wait: Set<any>;
 *   processing: Set<any>,
 *   finish: Set<any>,
 *   ignore: Set<any>,
 * }): void} progressFunc 进度报告回调函数,调用时传入当前任务队列的实时状态深拷贝对象
 * @returns {Promise<boolean>} 返回一个 Promise。返回是否完成的 boolean
 */
async function runSanjuuni(jobs, progressFunc) {
    if (!globalThis.SettingsG || !globalThis.LogG) return false;
    if (!jobs || typeof progressFunc !== 'function') return false;
    if (jobs.size === 0) return true;

    // 基础参数构建
    const targetW = String((SettingsG.screen.cellWidth * SettingsG.screen.width * 2) - 1);
    const targetH = String((SettingsG.screen.cellHeight * SettingsG.screen.height * 3) - 1);
    const finalArgs = [
        '-W', targetW,
        '-H', targetH,
        '-M8x6',
        ...(SettingsG.sanjuuniArgs ?? [])
    ];

    // 日志输出
    LogG.info(`使用显示器矩阵 ${SettingsG.screen.width}x${SettingsG.screen.height}, 目标分辨率 ${targetW}x${targetH}`);
    LogG.info(`一共 ${jobs.size} 个任务, 使用 ${SettingsG.thread} 个线程并发`);
    LogG.info('sanjuuni 程序参数:', ...finalArgs);

    // 构建预启动函数
    async function perRun({ workerId, job, jobList, report }) {
        const inFile = joinPath(SettingsG.sep, SettingsG.input, job);
        const outFile = joinPath(SettingsG.sep, SettingsG.output, job + '.32v');

        // 输入文件检查
        if (!File.isFile(inFile)) {
            LogG.warn(`[线程${workerId}] D 输入文件不存在(跳过):`, inFile);

            jobList.processing.delete(job);
            jobList.ignore.add(job);

            // 等待1ms防止短时间多次错误爆调用堆栈
            await new Promise(resolve => os.setTimeout(resolve, 1));

            report();
            return { ok: false, args: [] };
        }

        return {
            ok: true,
            args: [
                SettingsG.sanjuuni,
                '-i', inFile,
                '-o', outFile,
                ...finalArgs,
            ]
        };
    }

    // 启动多线程工作
    return await _runMultiThreadJobs({
        jobs,
        thread: SettingsG.thread,
        progressFunc,
        perRun,
    });
}

export { runSanjuuni }