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
            time: Date.now(),
            wait: [...data.wait],
            processing: [...data.processing],
            finish: [...data.finish],
            ignore: [...data.ignore]
        }
    } catch (_) {
        _status = {
            inRunning: false,
            inError: true,
            time: Date.now(),
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
            ? File.scanDir(SettingsG.sep, safePath)
            : File.scanFile(SettingsG.sep, safePath, body.exts);
        return _200Json(list);
    },
    // 获取文件
    '/api/fs/get': (query, headers, body) => {
        // 默认使用headers
        let path = headers.path
        let type = headers['File-Type']
        // 查询参数解析
        for (const e in query.split('&')) {
            if (e.startsWith('path=')) path = encodeURIComponent(e.split('=')[1] ?? '');
            if (e.startsWith('type=')) path = encodeURIComponent(e.split('=')[1] ?? '');
        }
        // 校验和处理
        const safePath = verifyPath(path);
        const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, ...safePath);
        if (!File.isFile(finalPath)) return code._404();
        const [ok, content] = File.read(...safePath);
        if (!ok && content === '') throw new Error('File read error');
        return code._200Buffer(type, content);
    },
    // 写入文件
    '/api/fs/set': (_, headers, body) => {
        const safeName = verifyPath(headers.name)[0] ?? 'noname_' + Date.now() + '.bin';
        const safePath = verifyPath(headers.path);
        const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, ...safePath, safeName)
        const [ok, content] = File.write(finalPath, 'wb', body);
        if (!ok && content === '') throw new Error('File read error');
        return code._201();
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
    '/api/job/status': () => {
        return code._200Json(_status)
    },
    // 开始工作
    '/api/job/start': (_, headers, body) => {
        if (_status.inRunning) return code._503();
        _status.inRunning = true;

        if (headers['Job-Type'] === 'multiple') {
            if (body?.length < 2) return code._400('Body load is non-compliant')
            imagePerProcess(_progress, body)
                .then(ok => {
                    _status.inError = !ok;
                    _status.inRunning = false;
                });
            return code._201()
        } else if (headers['Job-Type'] === 'single') {
            if (body?.length !== 1) return code._400('Body load is non-compliant')
            imagePerProcess(_progress, body)
                .then(ok => {
                    _status.inError = !ok;
                    _status.inRunning = false;
                });
            return code._201()
        } else if (headers['Job-Type'] === 'single-upload') {
            const tmpName = 'temp_' + Date.now() + '.jpg';
            const finalPath = joinPath(SettingsG.sep, SettingsG.appDir, 'input', tmpName);
            const [ok, err] = File.write(finalPath, 'wb', body);
            if (!ok) throw new Error(err);
            runSanjuuni(new Set([tmpName]), _progress)
                .then(ok => {
                    _status.inError = !ok;
                    _status.inRunning = false;
                });
            return code._201()
        } else {
            return code._400("Request header 'Job-Type' is non-compliant");
        }

    },
    '/api/job/clearError': () => {
        if (_status.inRunning) return code._503();
        _status.inError = false;
        return code._201()
    }
}

export { api }