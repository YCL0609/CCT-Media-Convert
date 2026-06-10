// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { File, joinPath, bufferToString } from '../libs/index.js';
import { code, cacheCtrl, verifyPath } from './libs.js';
import { getSource } from 'cctmc:sources';
import { LogG, SettingsG } from '../main.js';
import { api } from './apiHandle.js';
import * as net from 'cctmc:mininet';
import * as os from 'qjs:os';

/**
 * 启动本地 HTTP 服务器
 * @returns {void}
 */
async function startServer() {
    if (SettingsG.mode < 0 || SettingsG.mode > 1) throw new Error('Function running in not GUI or API mode!');
    const pathMap = JSON.parse(getSource('pathMap'));
    const useGUI = SettingsG.mode == 1;

    net.serve(SettingsG.net.LANAccess, SettingsG.net.port ?? 8080, (request) => {
        const rawUri = request.uri.toLowerCase();
        const url = rawUri.includes('?') ? rawUri.split('?')[1] : rawUri;
        LogG.debug(`收到请求: ${request.method} ${url}`);
        // 心跳包返回
        if (url === '/ping') return code._204();

        // 请求体解析
        let body;
        if (request.headers['Data-Type'] === 'raw') {
            // 二进制数据
            body = request.body;
        } else if (request.headers['Data-Type'] === 'json') {
            // Json数据
            try {
                body = JSON.parse(bufferToString(request.body))
            } catch (err) {
                return code._400(err?.message || String(err));
            }
        } else {
            // 字符串
            body = bufferToString(request.body)
        }

        if (request.method === 'GET' && useGUI) { // GUI 模式静态资源返回
            const cfg = pathMap[url];
            if (cfg) {
                // 缓存命中
                if (request.headers['If-None-Match'] === cfg.ETag) return [304, { 'cache-control': cacheCtrl.yes, ETag: cfg.ETag }, '']

                // 缓存未命中
                const txt = getSource(pathMap[url].name);
                return [200, { 'content-type': cfg.type, ETag: cfg.ETag }, txt]
            } else {
                // '/api'路径返回405其他返回404
                return url.startsWith('/api') ? code._405('POST') : code._404();
            }

        } else if (request.method === 'POST') { // API 模式返回
            try {
                if (api[url]) return api[url](request.query, request.headers, body)
                else return code._404();
            } catch (err) {
                return code._400(err?.message || String(err));
            }
        } else {
            return code._405(url.startsWith('/api') ? 'POST' : 'GET');
        }
    });

    LogG.info('HTTP 服务器启动成功, 可使用浏览器访问 http://localhost:' + SettingsG.net.port ?? 8080);

    // 主循环
    while (true) {
        net.poll();
        // 释放 CPU 控制权
        await os.sleepAsync(1);
    }
}


export { startServer };