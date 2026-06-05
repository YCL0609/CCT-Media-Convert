// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

// 命令行默认配置
const _cfg = {
    type: 0, // 0文件夹 1文件夹 2文件
    mode: 0, // 0-CLI 1-GUI 2-API
    thread: null,
    screen: {},
    input: null,
    debug: false,
    output: null,
    logDir: null,
    showHelp: false,
    sanjuuniArgs: null,
}

/**
 * 监测互斥参数并更新设置
 * @param {string} key 对应的键名
 * @param {*} data 要设置的数据 
 * @param {string} txt 错误提示前缀
 * @returns {false} 不消耗第二参数
*/
function _setValueO(key, data, txt) {
    const old = _cfg[key];
    if (old !== 0) throw new Error(txt + ' 检测到互斥参数');
    _cfg[key] = Number(data);
    return false;
}

/**
 * 更新第二个参数为新设置
 * @param {string} key 对应的键名
 * @param {*} data 要设置的数据
 * @param {string} txt 错误提示前缀
 * @param {function(data)|null} func 合规性校验函数 (可选)
 * @returns {true} 消耗第二参数
*/
function _setValueN(key, txt, data, func) {
    if (data === void 0) throw new Error(txt + ' 第二参数为空');
    if (typeof func === 'function' && !func(data))
        throw new Error(txt + ' 参数合规性校验失败');
    _cfg[key] = data;
    return true;
}

/**
 * 分离原始数字参数
 * @param {string} raw 原始字符串
 * @returns {{ok: boolean, data: [number, number]}} 是否合规和数据
 */
function _sepMatrix(raw) {
    if (!/^\d+x\d+$/.test(raw)) return { ok: false, data: [] };
    const [a, b] = raw.split('x');
    if (isNaN(Number(a))) return { ok: false, data: [] };
    if (isNaN(Number(b))) return { ok: false, data: [] };
    return { ok: true, data: [Number(a), Number(b)] };
}

/** 参数映射表 */
const _argHandlers = {
    // 调试模式
    '--debug': () => { _cfg.debug = true; return false },
    // 帮助信息
    '-h': () => { _cfg.showHelp = true; return false; },
    '--help': () => { _cfg.showHelp = true; return false; },
    // GUI 模式
    '--gui': (txt) => _setValueO('mode', 1, txt),
    // API 模式
    '--api': (txt) => _setValueO('mode', 2, txt),
    // 文件夹
    '-d': (txt) => _setValueO('type', 1, txt),
    '--dir': (txt) => _setValueO('type', 1, txt),
    // 文件
    '-f': (txt) => _setValueO('type', 2, txt),
    '--file': (txt) => _setValueO('type', 2, txt),
    // 输入路径
    '-i': (txt, data) => _setValueN('input', txt, data),
    '--input': (txt, data) => _setValueN('input', txt, data),
    // 输出路径
    '-o': (txt, data) => _setValueN('output', txt, data),
    '--output': (txt, data) => _setValueN('output', txt, data),
    // 配置文件
    '-c': (txt, data) => _setValueN('configPath', txt, data),
    '--config': (txt, data) => _setValueN('configPath', txt, data),
    // 日志路径
    '-l': (txt, data) => _setValueN('logDir', txt, data),
    '--logDir': (txt, data) => _setValueN('logDir', txt, data),
}

/**
 * 命令行参数解析器
 * @param {string[]} args 要解析的参数数组
 * @returns {object} 映射后的设置
 */
function cmdLineHandle(args) {
    // 无参数默认GUI模式
    if (args.length === 0) _cfg.mode = 1;

    // 解析
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (true) {
            // 矩阵大小解析
            case arg.startsWith('-M'):
                const matrix0 = _sepMatrix(arg.slice(2));
                if (!matrix0.ok) throw new Error(arg + ' 参数不合规');
                _cfg.screen.width = matrix0.data[0];
                _cfg.screen.height = matrix0.data[1];
                break;
            case arg.startsWith('--matrix='):
                const matrix1 = _sepMatrix(arg.split('=')[1]);
                if (!matrix1.ok) throw new Error(arg + ' 参数不合规');
                _cfg.screen.width = matrix1.data[0];
                _cfg.screen.height = matrix1.data[1];
                break;

            // 单元大小解析
            case arg.startsWith('-S'):
                const cellsize0 = _sepMatrix(arg.slice(2));
                if (!cellsize0.ok) throw new Error(arg + ' 参数不合规');
                _cfg.screen.cellWidth = cellsize0.data[0];
                _cfg.screen.cellHeight = cellsize0.data[1];
                break;
            case arg.startsWith('--cellsize='):
                const cellsize1 = _sepMatrix(arg.split('=')[1]);
                if (!cellsize1.ok) throw new Error(arg + ' 参数不合规');
                _cfg.screen.cellWidth = cellsize1.data[0];
                _cfg.screen.cellHeight = cellsize1.data[1];
                break;

            // sanjuuni参数解析
            case arg.startsWith('--sanjuuniArgs='):
                const raw = arg.split('=')[1].trim();
                const rawSign = raw.replace(/^['"]|['"]$/g, '')
                const sign = rawSign.split(' ');
                if (sign.length === 0 || sign[0] === '') throw new Error('sanjuuni 参数为空: ' + arg);
                _cfg.sanjuuniArgs = sign;
                break;

            // 线程参数解析
            case arg.startsWith('-t'):
                const num0 = Number(arg.slice(2));
                if (!isNaN(num0) && num0 > 0) _cfg.thread = num0;
                break;
            case arg.startsWith('--thread='):
                const num1 = Number(arg.split('=')[1]);
                if (!isNaN(num1) && num1 > 0) _cfg.thread = num1;
                break;

            // 其他参数处理
            default:
                if (_argHandlers[arg]) {
                    const nextData = (i + 1 < args.length) ? args[i + 1] : void 0;
                    if (_argHandlers[arg](arg, nextData)) i++;
                }
                break;
        }
    }
    return _cfg
}

export { cmdLineHandle }