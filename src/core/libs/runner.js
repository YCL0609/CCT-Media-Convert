// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { Settings, File, Log } from './file.js';
import { joinPath } from './base.js';
import { childPIDs } from './exit.js';

/**
 * 异步执行程序并重定向输出到文件
 * @param {String[]} args 要执行的程序
 * @param {function|null} signFunc 退出信号监测函数
 * @returns {Promise<number>} 程序退出码
 */
async function _execToLog(args, signFunc) {
    const doSign = typeof signFunc === 'function';

    // 执行程序
    const pid = os.exec(args, {
        block: false,
        stdout: Log.execFd,
        stderr: Log.execFd,
    });

    // 将 PID 加入子进程列表
    childPIDs.add(pid);

    if (doSign) {
        // 等待程序结束或信号
        while (true) {
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
            
            await os.sleepAsync(500);
        }
    } else {
        // 等待程序结束
        const [_, status] = os.waitpid(pid, 0);
        childPIDs.delete(pid);
        return status;
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
                    (typeof rawJob.name === 'string' && !rawJob.name.trim()) ||
                    jobList.processing.has(rawJob) ||
                    jobList.finish.has(rawJob) ||
                    jobList.ignore.has(rawJob)
                ) {
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
                // 外部程序调用
                code = await _execToLog(data.args, () => stopSign);
            } catch (err) {
                stopSign = true;
                jobList.processing.delete(job);
                jobList.ignore.add(job);
                Log.error(`[线程${workerId}] 启动外部程序失败:`, err.message);
                return false;
            }

            if (code === 0) {
                // 正常退出
                jobList.processing.delete(job);
                jobList.finish.add(job);
                Log.info(`[线程${workerId}] 转换成功:`, job);
            } else {
                // 错误退出处理
                stopSign = true;
                jobList.processing.delete(job);
                jobList.ignore.add(job);
                Log.error(`[线程${workerId}] 执行失败, 错误码:`, code);
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
    if (!jobs || typeof progressFunc !== 'function') return false;
    if (jobs.size === 0) return true;

    // 基础参数构建
    const cfg = Settings.get();
    const targetW = String(cfg.screen.cellWidth * cfg.screen.width * 2);
    const targetH = String(cfg.screen.cellHeight * cfg.screen.height * 3);
    const finalArgs = [
        '-W', targetW,
        '-H', targetH,
        '-M8x6@1',
        ...(cfg.sanjuuniArgs ?? [])
    ];

    // 日志输出
    Log.info(`使用显示器矩阵 ${cfg.screen.width}x${cfg.screen.height}, 目标分辨率 ${targetW}x${targetH}`);
    Log.info(`一共 ${jobs.size} 个任务, 使用 ${cfg.thread} 个线程并发`);
    Log.info('sanjuuni 程序参数:', ...finalArgs);

    // 构建预启动函数
    async function perRun({ workerId, job, jobList, report }) {
        const inFile = joinPath(cfg.sep, cfg.input, job.dir, job.name);
        const outFile = joinPath(cfg.sep, cfg.output, job.dir, job.name + '.32vid');

        // 输入文件检查
        if (!File.isFile(inFile)) {
            Log.warn(`[线程${workerId}] 输入文件不存在(跳过):`, inFile);

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
                cfg.sanjuuni,
                '-i', inFile,
                '-o', outFile,
                ...finalArgs,
            ]
        };
    }

    // 启动多线程工作
    return await _runMultiThreadJobs({
        jobs,
        thread: cfg.thread,
        progressFunc,
        perRun,
    });
}

/**
 * 多线程异步 ffmpeg 处理
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
async function runFfmpeg(jobs, progressFunc) {
    if (!jobs || typeof progressFunc !== 'function') return false;
    if (jobs.size === 0) return true;

    // 基础参数构建
    const cfg = Settings.get();
    const targetW = String(cfg.screen.cellWidth * cfg.screen.width * 2);
    const targetH = String(cfg.screen.cellHeight * cfg.screen.height * 3);
    const finalArgs = [
        '-r', cfg.video.fps,
        '-vf', `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1`,
        '-f', 'segment',
        '-g', cfg.video.gop,
        '-sc_threshold', '0',
        '-segment_time', cfg.video.segmentTime,
        '-reset_timestamps', '1',
    ];

    // 日志输出
    Log.info(`目标分辨率 ${targetW}x${targetH}, 目标帧率 ${cfg.video.fps}`);
    Log.info(`关键帧插入间隔 ${cfg.video.gop}, 单个切片长度 ${cfg.video.segmentTime}s`);
    Log.info(`一共 ${jobs.size} 个任务, 使用 ${cfg.thread} 个线程并发`);
    Log.info('ffmpeg 程序参数:', ...finalArgs);

    // 构建预启动函数
    async function perRun({ workerId, job, jobList, report }) {
        const inFile = joinPath(cfg.sep, cfg.input, job.dir, job.name);
        const outDir = joinPath(cfg.sep, cfg.output, job.dir, job.name);
        const ext = job.split('.').pop().toLowerCase();

        // 输入文件检查
        if (!File.isFile(inFile)) {
            Log.warn(`[线程${workerId}] 输入文件不存在(跳过):`, inFile);

            jobList.processing.delete(job);
            jobList.ignore.add(job);

            // 等待1ms防止短时间多次错误爆调用堆栈
            await new Promise(resolve => os.setTimeout(resolve, 1));

            report();
            return { ok: false, args: [] };
        }

        // 输出目录检查
        if (!File.isDir(outDir)) {
            if (os.mkdir(outDir) !== 0) {
                Log.warn(`[线程${workerId}] 无法创建输出文件夹(跳过):`, outDir);

                jobList.processing.delete(job);
                jobList.ignore.add(job);

                await new Promise(resolve => os.setTimeout(resolve, 1));

                report();
                return true;
            }
        }

        return {
            ok: true,
            args: [
                cfg.ffmpeg,
                '-i', inFile,
                ...finalArgs,
                '-y', joinPath(cfg.sep, outDir, `part_%03d${ext}`)
            ]
        };
    }

    // 启动多线程工作
    return await _runMultiThreadJobs({
        jobs,
        thread: cfg.thread,
        progressFunc,
        perRun,
    });
}

export {
    runFfmpeg,
    runSanjuuni,
}