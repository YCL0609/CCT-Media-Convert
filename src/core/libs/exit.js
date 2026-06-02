import * as std from 'qjs:std';
import { Log } from './file.js';

/**
 * 子进程PID列表
 */
const childPIDs = new Set();

function _exitChild() {
    // 手动实现Linux/win子进程结束
}

/**
 * 错误退出
 * @param {string} text 提示信息
 * @param {number|null} id errno代码
 * @returns {void}
 */
function errorExit(text, id) {
    if (id !== void 0) text += ' - Code: ' + id;
    const txt = '[FAIL] ' + String(text) + '\n';
    std.err.puts(txt);
    std.err.flush();
    if (Log.logFd) {
        Log.logFd.puts(txt);
        Log.logFd.flush();
    }
    _exitChild();
    Log.closeFd();
    std.exit(1);
}

/**
 * 退出应用
 */
function exit() {
    // .....
    _exitChild();
    Log.closeFd();
    std.exit(0);
}


export {
    exit,
    errorExit,
    childPIDs,
}