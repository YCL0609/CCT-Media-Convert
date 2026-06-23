// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

import { LogG, SettingsG } from '../global.js';
import { File, Log } from '../libs/file.js';
import { joinPath } from '../libs/base.js';
import * as winproc from 'qjsa:winproc';
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
 * @param {Set} options.jobs 工作列表集合
 * @param {number} options.thread 并发线程
 * @param {function({
 *   wait: String[],
 *   processing: String[],
 *   finish: String[],
 *   ignore: String[],
 * }): void} options.progressFunc 进度汇报函数
 *  - 传入一个对象, 对象包含处于各工作阶段的图片名称数组拷贝
 * @param {function({workerId:string, job:string}): Promise<{
 *   ok: boolean,
 *   args: string[]
 * }>} options.perRun 预运行函数
 *  - 传入一个对象, 包含当前的线程ID和当前工作的图片名称
 *  - 预期返回一个对象, 包含是否预处理成功的`boolean`和要运行的程序完整命令行数组
 * @returns {Promise<boolean>} Promise返回一个`boolean`表示是否执行成功
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

    // 全局停止信号
    let stopSign = false;

    // 进度报告函数构建
    const report = () => progressFunc({
        wait: [...jobList.wait],
        processing: [...jobList.processing],
        finish: [...jobList.finish],
        ignore: [...jobList.ignore]
    });

    /**
     * 工作线程执行主体
     */
    async function doJob(workerId) {
        while (!stopSign) {
            // 循环获取任务，直到没有任务或触发停止信号
            let job;
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
                    LogG.debug(`[线程${workerId}] D 任务合规性校验失败(跳过):`, rawJob)
                    continue;
                }

                jobList.processing.add(rawJob);
                job = rawJob;
                break;
            }
            if (!job) {
                LogG.debug(`[线程${workerId}] D 任务列表为空, 线程退出`);
                break;
            }
            LogG.debug(`[线程${workerId}] D 成功获取任务:`, job);

            let code;
            try {
                // 执行预启动函数
                const data = perRun({ workerId, job });

                // 静默失败
                if (!data.ok) {
                    LogG.warn(`[线程${workerId}] E 预运行函数运行失败(跳过):`, job)
                    jobList.processing.delete(job);
                    jobList.ignore.add(job);
                    // 等待1ms防止短时间多次错误爆调用堆栈
                    await new Promise(resolve => os.setTimeout(resolve, 1));
                    continue;
                }

                LogG.info(`[线程${workerId}] I 开始转换:`, job);

                // 外部程序调用
                code = await _execToLog(data.args, () => stopSign);
            } catch (err) {
                stopSign = true;
                jobList.processing.delete(job);
                jobList.ignore.add(job);
                LogG.error(`[线程${workerId}] E 启动外部程序失败:`, (err?.message || String(err)));
                break;
            }

            // 状态更新
            jobList.processing.delete(job);
            if (code === 0) {
                jobList.finish.add(job);
                LogG.info(`[线程${workerId}] S 转换成功:`, job);
            } else {
                stopSign = true;
                jobList.ignore.add(job);
                LogG.error(`[线程${workerId}] E 执行失败, 错误码:`, code);
            }

            report();
        }
    }

    // 构建并启动线程并发
    const workers = [];
    for (let i = 1; i <= thread; i++) {
        workers.push(doJob(i));
    }

    report(); // 初始化进度报告
    const startTime = performance.now()
    await Promise.all(workers); // 等待所有线程执行完毕
    const totalTime = (performance.now() - startTime).toFixed(3);
    if (stopSign) {
        LogG.info(`处理程序终止 - 用时 ${totalTime} ms`)
    } else {
        LogG.info(`处理完成 - 用时 ${totalTime} ms`)
    }
    return !stopSign;
}

/**
 * 多线程异步 Sanjuuni 转换
 * @async
 * @param {Set} jobs - 要执行的初始集合
 * @param {function({
 *   wait: String[],
 *   processing: String[],
 *   finish: String[],
 *   ignore: String[],
 * }): void} progressFunc 进度汇报函数
 *  - 传入一个对象, 对象包含处于各工作阶段的图片名称数组拷贝
 * @returns {Promise<boolean>}  Promise返回一个`boolean`表示是否执行成功
 */
async function runSanjuuni(jobs, progressFunc) {
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
    function perRun({ workerId, job }) {
        const inFile = joinPath(SettingsG.sep, SettingsG.input, job);
        const outFile = joinPath(SettingsG.sep, SettingsG.output, job + '.32v');

        // 输入文件检查
        if (!File.isFile(inFile)) {
            LogG.debug(`[线程${workerId}] D 输入文件不存在(跳过):`, inFile);
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