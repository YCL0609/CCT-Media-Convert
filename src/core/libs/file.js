// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import * as std from 'qjs:std';
import * as os from 'qjs:os';
import { cmdLineHandle, errorExit, joinPath, jsonCheck } from './base.js';
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
     * 读取文件
     * @param {string} path 要读取的文件路径
     * @param {*} defaultContnt 默认的文件内容
     * @returns {*} 成功返回内容，失败返回`defaultContnt`
     */
    read(path, defaultContnt = '') {
        if (!path) return '';
        if (!this.isFile(path)) {
            if (!this.isDir(path)) this.write(path, 'wb', defaultContnt);
            return defaultContnt;
        }
        const data = std.loadFile(path);
        if (data === null) return defaultContnt;

        return data;
    },

    /**
     * 写入文件
     * @param {string} path 要写入的文件路径
     * @param {string} mode 文件写入模式
     * @param {*} data 要写入的数据
     * @returns {boolean} 操作是否成功
     */
    write(path, mode, data) {
        if (!path || !mode || !data) return false;
        let fd = null;
        try {
            fd = std.open(path, mode);
            if (!fd) throw new Error('Can not open file!');
            if (typeof data === 'string') fd.puts(data);
            else fd.write(data.buffer || data);
            return true;
        } catch (err) {
            log.error('File write Error:', 'Path:', path, 'Info:', err?.message || String(err));
            return false;
        } finally {
            if (fd) fd.close();
        }
    },

    /**
     * 扫描文件夹，返回指定后缀名文件列表
     * @param {string} path 目标文件夹路径
     * @param {string[]|null} exts 允许的后缀名列表, 为空则禁用过滤器
     * @returns {string[]} 过滤后的文件名列表
     */
    scanFile(path, exts) {
        if (!path) return [];
        const fileNames = [];
        const allowedExts = Array.isArray(exts) ? exts.map(e => e.toLowerCase()) : [];

        const basicDir = path.endsWith(Settings.sep) ? path : path + Settings.sep;
        const [files, err] = os.readdir(path);

        if (err !== 0) {
            Log.error('文件夹打开错误: Error code', err);
            return [];
        }

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            const [st, statErr] = os.stat(basicDir + file);
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
     * 扫描文件夹，返回所有子文件夹列表
     * @param {string} path 目标文件夹路径
     * @returns {string[]} 文件夹名称列表
     */
    scanDir(path) {
        if (!path) return [];
        const dirList = [];
        const allowedExts = Array.isArray(exts) ? exts.map(e => e.toLowerCase()) : [];

        const basicDir = path.endsWith(Settings.sep) ? path : path + Settings.sep;
        const [files, err] = os.readdir(path);

        if (err !== 0) {
            Log.error('文件夹打开错误: Error code', err);
            return [];
        }

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            const [st, statErr] = os.stat(basicDir + file);
            if (statErr !== 0) continue;

            if ((st.mode & os.S_IFMT) === os.S_IFDIR) {
                dirList.push(file);
            }
        }
        return dirList;
    }
}

// 程序配置缓存
let _setting = null
/**
 * 程序设置操作实例
 * @namespace
 */
const Settings = {
    /** 路径分隔符 */
    sep: _isWin ? '\\' : '/',

    /** 程序所处文件夹 */
    appDir: (() => {
        const entry = scriptArgs[0] || '.';
        const [path, err] = os.realpath(entry);
        if (err !== 0) errorExit(`无法解析程序路径: ${entry}`);
        const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return idx === -1 ? '.' : path.slice(0, idx);
    })(),

    /**
     * 获取配置
     * @returns {object}
     */
    get() {
        if (_setting !== null) return _setting;
        if (scriptArgs.includes('-h') || scriptArgs.includes('--help')) return {};
        const cmd = cmdLineHandle(scriptArgs);
        const cfgPath = cmd.configPath ?? joinPath(this.sep, this.appDir, 'config.json');

        // 构建默认配置
        const defSetting = {
            ffmpeg: joinPath(this.sep, this.appDir, 'ffmpeg', 'bin', 'ffmpeg' + (_isWin ? '.exe' : '')),
            sanjuuni: joinPath(this.sep, this.appDir, 'sanjuuni-cli', 'sanjuuni' + (_isWin ? '.exe' : '')),
            input: joinPath(this.sep, this.appDir, 'input'),
            output: joinPath(this.sep, this.appDir, 'output'),
            logDir: joinPath(this.sep, this.appDir, 'logs'),
            screen: { width: 4, height: 3, cellWidth: 164, cellHeight: 81 },
            thread: 2,
            sanjuuniArgs: ["-k", "-L", "-O", "-3"],
            video: { fps: 10, gop: 100, segmentTime: 5 }
        };

        // 获取用户配置
        let userCfg = '{}';
        if (File.isFile(cfgPath)) {
            userCfg = File.read(cfgPath, JSON.stringify(defSetting));
        }


        // 解析配置
        let cfg;
        try {
            cfg = jsonCheck(JSON.parse(userCfg), defSetting);
        } catch (err) {
            errorExit('配置文件解析错误: ' + err?.message);
        }

        // 注入参数
        cfg.configPath = cfgPath;
        cfg.isImage = cmd.isImage ?? true;
        cfg.isDir = cmd.isDir ?? true;

        // 确保文件夹存在
        if (cfg.isDir) os.mkdir(cfg.input);
        os.mkdir(cfg.output);
        os.mkdir(cfg.logDir);

        // 输入输出预检测
        const inputOK = cfg.isDir
            ? File.isDir(cfg.input)
            : File.isFile(cfg.input);
        const outputOK = cfg.isDir
            ? File.isDir(cfg.output)
            : true;

        // 依赖文件预检测
        const ffmpegOK = File.isFile(cfg.ffmpeg) && File.canRun(cfg.ffmpeg);
        const sanjuuniOK = File.isFile(cfg.sanjuuni) && File.canRun(cfg.sanjuuni);

        // 输入输出报错
        if (!inputOK) errorExit('输入路径不是' + (cfg.isDir ? '文件夹' : '文件'));
        else if (!outputOK) errorExit('输出路径不是' + (cfg.isDir ? '文件夹' : '文件'));

        // 依赖错误检测
        else if (!sanjuuniOK) errorExit('sanjuuni路径不是文件或不可执行');
        else if (!cfg.isImage && !ffmpegOK) errorExit('ffmpeg路径不是文件或不可执行');

        // 日志文件报错
        else if (!File.isDir(cfg.logDir)) errorExit('日志文件路径不是文件夹');

        _setting = cfg;
        return cfg;
    },

    /**
     * 保存配置
     * @param {object} data 要保存的配置
     * @returns {void}
     */
    set(data) {
        if (typeof data !== 'object' || _setting === null) return false;
        // 合并配置
        const newCfg = jsonCheck(data, _setting);

        // 删除动态配置
        delete newCfg.isDir;
        delete newCfg.isFile;
        delete newCfg.configPath;

        // 保存配置
        return File.write(_setting.configPath, 'w', JSON.stringify(newCfg));
    }
}

// 日志名前置
const _date = new Date();
const _rawName = `log_${_date.getFullYear()}-${String(_date.getMonth() + 1).padStart(2, '0')}-${String(_date.getDate()).padStart(2, '0')}`;
/**
 * 日志输出工具
 * @namespace
 */
const Log = {
    /**
     * 外部工具调用日志句柄
     */
    execFd: (() => {
        const cfg = Settings.get();
        const noLog = !cfg.logDir?.trim();

        const path = noLog
            ? (os.platform === 'win32' ? 'NUL' : '/dev/null')
            : joinPath(Settings.sep, cfg.logDir, _rawName + '_exec.log');

        const flags = noLog
            ? os.O_WRONLY
            : (os.O_WRONLY | os.O_CREAT | os.O_APPEND);

        const fd = os.open(path, flags, 0o666);
        if (fd < 0) errorExit('无法打开日志文件句柄');
        return fd;
    })(),

    /**
     * 程序本体日志句柄
     */
    logFd: (() => {
        const cfg = Settings.get();
        if (!cfg.logDir?.trim()) return null;

        const path = joinPath(Settings.sep, cfg.logDir, _rawName + '_app.log');
        const fd = std.open(path, 'a');

        if (fd === null) errorExit('无法打开日志文件句柄');
        return fd;
    })(),

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
    },

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
    },

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
    },

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