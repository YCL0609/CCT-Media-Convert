import { File, joinPath } from "../libs/index.js";
import { code, verifyPath } from "./libs.js";
import { SettingsG } from "../main.js";
import { runSanjuuni } from "../runner/libs.js";
import { imagePerProcess } from "../runner/picture.js";

/** 进度缓存变量 */
let _status = {
    inRunning: false,
    inError: false,
    time: 0,
    wait: [],
    processing: [],
    finish: [],
    ignore: []
}

/**
 * 进度汇报函数
 * @param {{
 *   wait: Set<any>;
 *   processing: Set<any>,
 *   finish: Set<any>,
 *   ignore: Set<any>,
 * }} data 后端发送的信息
 * @returns {void}
 */
function _progress(data) {
    try {
        _status = {
            inRunning: true,
            inError: false,
            wait: [...data.wait],
            processing: [...data.processing],
            finish: [...data.finish],
            ignore: [...data.ignore]
        }
    } catch (_) {
        _status = {
            inRunning: false,
            inError: true,
            wait: [],
            processing: [],
            finish: [],
            ignore: []
        }
    }
}

/** API 路径处理程序映射 */
const api = {
    // 列出文件
    '/api/fs/list': (_, __, body) => {
        const safePath = verifyPath(body.path);
        const list = body.type == 1 // 1文件夹 2文件
            ? File.scanDir(SettingsG.sep, ...safePath)
            : File.scanFile(SettingsG.sep, ...safePath, body.exts?.split(','));
        return code._200Json(list);
    },
    // 获取文件
    '/api/fs/get': (_, __, body) => {
        const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, ...verifyPath(body.path));
        if (!File.isFile(finalPath)) return code._404();
        const [ok, content] = File.read(finalPath);
        if (!ok && content === '') throw new Error('File read error');
        return code._200Buffer(content);
    },
    // 写入文件
    '/api/fs/set': (_, headers, body) => {
        const safePath = verifyPath(headers['File-Path']);
        const safeName = verifyPath(headers['File-Name'])[0] ?? 'noname_' + Date.now() + '.bin';
        const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, ...safePath, safeName)
        const [ok, content] = File.write(finalPath, 'wb', body);
        if (!ok && content === '') throw new Error('File read error');
        return code._201();
    },
    // 删除文件
    '/api/fs/del': (_, __, body) => {
        for (const name of body) {
            const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, ...verifyPath(name));
            if (!File.isFile(finalPath)) return code._404();
            const [ok, content] = File.delete(finalPath);
            if (!ok && content === '') throw new Error('File delete error: '+ name);
        }
        return code._204();
    },
    // 获取配置
    '/api/settings/get': (_, headers) => {
        let ok = false;
        if (
            headers.Host === `127.0.0.1:${SettingsG.net.port}` ||
            headers.Host === `localhost:${SettingsG.net.port}`
        ) ok = true;
        return ok ? code._200Json({
            sanjuuni: SettingsG.sanjuuni,
            input: SettingsG.input,
            output: SettingsG.output,
            logDir: SettingsG.logDir,
            screen: SettingsG.screen,
            thread: SettingsG.thread,
            sanjuuniArgs: SettingsG.sanjuuniArgs,
            net: SettingsG.net,
        }) : code._403();
    },
    // 写入配置
    '/api/settings/set': (_, headers, body) => {
        if (
            headers.Host !== `127.0.0.1:${SettingsG.net.port}` ||
            headers.Host !== `localhost:${SettingsG.net.port}`
        ) return code._403();
        const [ok, err] = SettingsG.Set(body);
        if (!ok) throw new Error(err);
        return code._201();
    },
    // 获取工作状态
    '/api/job/status': () => code._200Json(_status),
    // 开始工作
    '/api/job/start': (_, headers, body) => {
        if (_status.inRunning) return code._503();
        if (!Array.isArray(body)) return code._400('Body load is non-compliant')
        if (body.length === 0) return code._201();
        _status.inRunning = true;
        imagePerProcess(_progress, body)
            .then(ok => {
                _status.inError = !ok;
                _status.inRunning = false;
            });
        return code._201()
    },
    '/api/job/clearError': () => {
        _status.inError = false;
        return code._201()
    }
}

export { api }