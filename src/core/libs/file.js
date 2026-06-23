// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

import * as os from 'qjs:os';
import * as std from 'qjs:std';
import { getSource } from 'qjsa:resources';
import { bufferToString, exitApp, joinPath, jsonCheck } from './base.js';
import { cmdLineHandle } from './cmd.js';
const _isWin = os.platform === 'win32';

/**
 * 文件操作实例
 * @namespace
 */
const File = {
    /**
     * 判断是否是文件
     * @param {string} path 要判断的路径 
     * @returns {boolean}
     */
    isFile(path) {
        if (!path) return false;
        const [st, _] = os.stat(path);
        return st !== null && (st.mode & os.S_IFMT) === os.S_IFREG;
    },

    /**
     * 判断是否是目录
     * @param {string} path 要判断的路径 
     * @returns {boolean}
     */
    isDir(path) {
        if (!path) return false;
        const [st, _] = os.stat(path);
        return st !== null && (st.mode & os.S_IFMT) === os.S_IFDIR;
    },

    /**
     * 判断是否是可执行文件
     * @param {string} path 要判断的路径 
     * @returns {boolean}
     */
    canRun(path) {
        if (!path) return false;
        const [st, _] = os.stat(path);
        return st !== null &&
            (st.mode & os.S_IFMT) === os.S_IFREG &&
            (st.mode & 0o111) !== 0;
    },

    /**
     * 读取文件（支持文本与二进制文件）
     * @param {string} path 要读取的文件路径
     * @param {string|ArrayBuffer|Uint8Array} defaultContent 默认的文件内容
     * @returns {[boolean, string|ArrayBuffer|Uint8Array]} 返回一个元组
     * - `success`: 操作是否成功
     * - `content`: 文件内容（ArrayBuffer 或 字符串）, 若操作失败则返回默认内容
     */
    read(path, defaultContent = '') {
        if (!path) return [false, defaultContent];

        if (this.isFile(path)) {
            const fd = std.open(path, "rb");
            if (!fd) return [false, defaultContent];

            try {
                // 获取文件大小
                fd.seek(0, std.SEEK_END);
                const size = fd.tell();
                fd.seek(0, std.SEEK_SET);

                // 分配内存并读取原始二进制数据
                const buffer = new ArrayBuffer(size);
                const bytesRead = fd.read(buffer, 0, size);

                if (bytesRead !== size) return [false, defaultContent];
                return [true, buffer];
            } catch (_) {
                return [false, defaultContent];
            } finally {
                fd.close();
            }
        } else if (this.isDir(path)) {
            return [false, defaultContent];
        } else {
            const [ok, _] = this.write(path, 'wb', defaultContent);
            return [ok, defaultContent];
        }
    },

    /**
     * 写入文件
     * @param {string} path 要写入的文件路径
     * @param {string} mode 文件写入模式
     * @param {string|ArrayBuffer} data 要写入的数据
     * @returns {[boolean, string|null]} 返回一个元组
     * - `success`: 操作是否成功
     * - `errorMsg`: 失败时的错误信息, 成功时为 null
     */
    write(path, mode, data) {
        if (!path || !mode || !data) return [false, 'Missing parameter'];
        let fd = null;
        try {
            fd = std.open(path, mode);
            if (!fd) throw new Error('Can not open file!');
            if (typeof data === 'string') fd.puts(data);
            else fd.write(data.buffer || data);
            return [true, null];
        } catch (err) {
            return [false, err?.message || String(err)];
        } finally {
            if (fd) fd.close();
        }
    },

    /**
     * 删除文件
     * @param {string} path 要删除的文件路径
     * @returns {[boolean, string|null]} 返回一个元组
     * - `success`: 操作是否成功
     * - `errorMsg`: 失败时的错误信息, 成功时为 null
     */
    delete(path) {
        if (!path) return [false, 'Missing parameter'];
        if (!this.isFile(path)) return [false, 'Not a file'];
        const erron = os.remove(path);
        if (erron !== 0) return [false, std.strerror(-erron)];
        return [true, null];
    },

    /**
     * 扫描文件夹, 返回指定后缀名文件列表
     * @param {string} sep 路径分隔符
     * @param {string} path 目标文件夹路径
     * @param {string[]|null} exts 允许的后缀名列表, 为空则禁用过滤器
     * @returns {string[]} 过滤后的文件名列表
     */
    scanFile(sep, path, exts) {
        if (!path) return [];
        const fileNames = [];
        const allowedExts = Array.isArray(exts) ? exts.map(e => e.toLowerCase()) : [];
        const [files, err] = os.readdir(path);
        if (err !== 0) throw new Error('Folder open error: Code ' + err);

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            const [st, statErr] = os.stat(joinPath(sep, path, file));
            if (statErr !== 0) continue;
            const isDirectory = (st.mode & os.S_IFMT) === os.S_IFDIR;

            if (!isDirectory) {
                // 未指定过滤器时全部放行
                if (allowedExts.length === 0) {
                    fileNames.push(file);
                    continue;
                }

                // 使用后缀名过滤器
                const lowerFile = file.toLowerCase();
                const match = allowedExts.some(ext => lowerFile.endsWith(ext));
                if (match) fileNames.push(file);
            }
        }
        return fileNames;
    },

    /**
     * 扫描文件夹, 返回所有子文件夹列表
     * @param {string} sep 路径分隔符
     * @param {string} path 目标文件夹路径
     * @returns {string[]} 文件夹名称列表
     */
    scanDir(sep, path) {
        if (!path) return [];
        const dirList = [];
        const [files, err] = os.readdir(path);
        if (err !== 0) return [];

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            const [st, statErr] = os.stat(joinPath(sep, path, file));
            if (statErr !== 0) continue;

            if ((st.mode & os.S_IFMT) === os.S_IFDIR) {
                dirList.push(file);
            }
        }
        return dirList;
    }
}

/**
 * 程序设置操作实例
 * @class
 */
class Settings {
    sanjuuni = ''; // sanjuuni路径
    input = ''; // 输入路径
    output = ''; // 输出路径
    logDir = ''; // 日志文件夹
    screen = {
        width: 4, // 显示器矩阵宽
        height: 3, // 显示器矩阵高
        cellWidth: 164, // 单屏幕宽
        cellHeight: 81 // 单屏幕高
    };
    thread = 2; // 并发线程
    sanjuuniArgs = ["-k", "-L", "-O", "-3"]; // sanjuuni  额外参数
    net = {
        port: 26609,
        LANAccess: false,
    }

    sep = ''; // 路径分隔符
    debug = false; // 调试模式
    appDir = ''; // 程序所处文件夹
    configPath = ''; // 配置文件路径
    type = 1; // 类型: 1文件夹 2文件 
    mode = 1; // 程序模式: 0-CLI 1-GUI 2-API

    // 构造器
    constructor() {
        // 初始化基础配置
        this.sep = os.platform === 'win32' ? '\\' : '/';
        const exePath = (os.exePath() ?? '');
        const index = exePath.lastIndexOf(this.sep);
        this.appDir = index !== -1 ? exePath.slice(0, index) : '.';

        // 获取配置
        const cmd = cmdLineHandle(scriptArgs.slice(1));
        const cfgPath = cmd.configPath ?? joinPath(this.sep, this.appDir, 'config.json');

        // 构建默认配置
        const defSetting = {
            sanjuuni: joinPath(this.sep, this.appDir, 'sanjuuni', 'sanjuuni' + (_isWin ? '.exe' : '')),
            input: joinPath(this.sep, this.appDir, 'input'),
            output: joinPath(this.sep, this.appDir, 'output'),
            logDir: joinPath(this.sep, this.appDir, 'logs'),
            screen: { width: 4, height: 3, cellWidth: 164, cellHeight: 81 },
            thread: 2,
            sanjuuniArgs: ["-k", "-L", "-O", "-3"],
            net: { port: 26609, LANAccess: false, },
        };

        // 获取用户配置
        let userCfg = '{}';
        if (File.isFile(cfgPath)) {
            const defCfg = JSON.stringify(defSetting);
            const [ok, cfg] = File.read(cfgPath, defCfg);
            userCfg = ok ? bufferToString(cfg) : defCfg;
        }

        // 解析配置
        const cfg = jsonCheck(JSON.parse(userCfg), defSetting);
        Object.assign(this, jsonCheck(cmd, cfg));
        this.mode = cmd.mode;
        this.debug = cmd.debug;
        this.configPath = cfgPath;
        this.type = (cmd.type !== 0) ? cmd.type : 1;

        // Win端非ASCII检测
        if (os.platform === 'win32') {
            let isShow = false
            const ASCIIRegx = /[^\x00-\x7F]/;
            ['sanjuuni', 'input', 'output', 'logDir', 'appDir', 'configPath'].forEach(e => {
                if (ASCIIRegx.test(this[e])) isShow = true;
            });
            if (isShow) {
                const txtBack = '路径参数有非ASCII字符, qjs本身不支持非ASCII字符, 退出应用。\n The path parameter contains non-ASCII characters. QJS itself does not support non-ASCII characters, so the application will exit.';
                std.out.puts(getSource('winAsciiErr') ?? txtBack);
                std.out.flush();
                std.out.puts('\nExit in 10 seconds ...');
                std.out.flush();
                os.sleep(10000);
                std.exit(1);
            }
        }

        // 确保文件夹存在
        if (this.type === 1) os.mkdir(this.input);
        os.mkdir(this.output);
        os.mkdir(this.logDir);

        // 输入输出预检测
        const inputOK = this.type === 1
            ? File.isDir(this.input)
            : File.isFile(this.input);
        const outputOK = this.type === 1
            ? File.isDir(this.output)
            : true;

        // 依赖文件预检测
        const sanjuuniOK = File.isFile(this.sanjuuni) && File.canRun(this.sanjuuni);

        // 输入输出报错
        if (!inputOK) throw new Error('输入路径不是' + (this.type === 1 ? '文件夹' : '文件'));
        else if (!outputOK) throw new Error('输出路径不是' + (this.type === 1 ? '文件夹' : '文件'));

        // 依赖错误检测
        else if (!sanjuuniOK) throw new Error('sanjuuni路径不是文件或不可执行');

        // 日志文件报错
        else if (!File.isDir(this.logDir)) throw new Error('日志文件路径不是文件夹');
    };

    /**
     * 保存配置
     * @param {object} data 要保存的配置
     * @returns {[boolean, string|null]} 返回一个元组
     * - `success`: 操作是否成功
     * - `errorMsg`: 失败时的错误信息, 成功时为 null
     */
    set(data) {
        if (!data || typeof data !== 'object') return [false, 'Invalid parameter'];

        const oldCfg = {
            sanjuuni: this.sanjuuni,
            input: this.input,
            output: this.output,
            logDir: this.logDir,
            screen: this.screen,
            thread: this.thread,
            sanjuuniArgs: this.sanjuuniArgs,
            net: this.net,
        };


        try {
            const newCfg = jsonCheck(data, oldCfg);
            const json = JSON.stringify(newCfg, null, 2);
            const [ok, errMsg] = File.write(this.configPath, 'wb', json);
            if (!ok) return [false, errMsg || 'Write failed'];
            Object.assign(this, newCfg);
            return [true, null];
        } catch (err) {
            return [false, err?.message || String(err)];
        }
    }
}

/**
 * 日志输出工具
 * @class
 */
class Log {
    /**
     * 是否启用调试日志
     */
    #isDebug = false;
    /**
     * 外部工具调用日志句柄
     */
    execFd = null;

    /**
     * 外部工具调用日志文件名
     */
    execPath = null;

    /**
     * 程序本体日志句柄
     */
    logFd = null;

    /**
     * 日志输出工具
     * @param {string} sep 路径分隔符 
     * @param {string} logDir 日志文件夹
     * @param {boolean} isDebug 是否输出调试日志
     */
    constructor(sep, logDir, isDebug) {
        // 默认文件名前缀
        const _date = new Date();
        const _rawName = `log_${_date.getFullYear()}-${String(_date.getMonth() + 1).padStart(2, '0')}-${String(_date.getDate()).padStart(2, '0')}`;

        // 外部程序日志文件名
        const path1 = joinPath(sep, logDir, _rawName + '_exec.log');

        // 程序本体日志文件名
        const path2 = joinPath(sep, logDir, _rawName + '_app.log');

        // 外部日志标志位
        const flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND;

        // 外部程序日志句柄 (非win端)
        let fd1 = null;
        if (os.platform !== 'win32') {
            fd1 = os.open(path1, flags, 0o666);
            if (fd1 < 0) throw new Error('无法打开日志文件句柄');
        }

        // 程序本体日志句柄
        const fd2 = std.open(path2, 'a');
        if (fd2 === null) throw new Error('无法打开日志文件句柄');

        this.logFd = fd2;
        this.execFd = fd1;
        this.execPath = path1;
        this.#isDebug = isDebug;
    };


    /**
     * 打印调试级别日志到标准输出
     * @param {...*} args 需打印的参数
     * @returns {void}
     */
    debug(...args) {
        if (!this.#isDebug) return;
        const txt = '[DEBG] ' + args.map(String).join(' ') + '\n';
        std.out.puts(txt);
        std.out.flush();
        if (!this.logFd) return;
        this.logFd.puts(txt);
        this.logFd.flush();
    }

    /**
     * 打印信息级别日志到标准输出
     * @param {...*} args 需打印的参数
     * @returns {void}
     */
    info(...args) {
        const txt = '[INFO] ' + args.map(String).join(' ') + '\n';
        std.out.puts(txt);
        std.out.flush();
        if (!this.logFd) return;
        this.logFd.puts(txt);
        this.logFd.flush();
    };

    /**
     * 打印警告级别日志到标准错误
     * @param {...*} args 需打印的参数
     * @returns {void}
     */
    warn(...args) {
        const txt = '[WARN] ' + args.map(String).join(' ') + '\n';
        std.err.puts(txt);
        std.err.flush();
        if (!this.logFd) return;
        this.logFd.puts(txt);
        this.logFd.flush();
    };

    /**
     * 打印错误级别的日志到标准错误
     * @param {...*} args 需打印的参数
     * @returns {void}
     */
    error(...args) {
        const txt = '[ERRO] ' + args.map(String).join(' ') + '\n';
        std.err.puts(txt);
        std.err.flush();
        if (!this.logFd) return;
        this.logFd.puts(txt);
        this.logFd.flush();
    };

    /**
     * 关闭日志句柄
     * @returns {void}
     */
    closeFd() {
        if (this.logFd) {
            this.logFd.flush();
            this.logFd.close();
        }

        if (this.execFd >= 0) {
            os.close(this.execFd);
        }
    }
};

export {
    Log,
    File,
    Settings,
}