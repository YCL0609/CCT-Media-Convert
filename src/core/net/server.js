// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

import { File, joinPath, bufferToString } from '../libs/index.js';
import { code, cacheCtrl, verifyPath } from './libs.js';
import { LogG, SettingsG } from '../global.js';
import { getSource } from 'qjsa:resources';
import { apiMap } from './apiHandle.js';
import * as net from 'qjsa:mininet';
import * as os from 'qjs:os';

/**
 * 启动本地 HTTP 服务器
 * @returns {void}
 */
async function startServer() {
    if (SettingsG.mode !== 1 && SettingsG.mode !== 2) throw new Error('Function running in not GUI or API mode!');
    const fileMap = JSON.parse(getSource('pathMap'));
    const useGUI = SettingsG.mode == 1;
    const version = getSource('version');

    net.serve(SettingsG.net.LANAccess, SettingsG.net.port ?? 8080, (request) => {
        const rawUri = request.uri;
        const url = rawUri.includes('?') ? rawUri.split('?')[1] : rawUri;

        // 心跳包返回
        if (url === '/ping') return code._204();
        
        // 合规性检查
        const isFile = !!fileMap[url];
        const isAPI = !!apiMap[url];
        if (!isFile && !isAPI) return code._404();
        else if (!useGUI && isFile) return code._403('Web GUI mode disabled.');

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

        // GUI 模式静态资源返回
        if (request.method === 'GET') {
            if (isAPI) return code._405('POST');

            // 缓存命中
            if (request.headers['If-None-Match'] === version) return [304, { 'cache-control': cacheCtrl.yes, ETag: version }, ''];

            // 缓存未命中
            else return [200, { 'content-type': 'text/html; charset=utf-8', ETag: version }, getSource(fileMap[url])];
        }

        // API 模式返回
        else if (request.method === 'POST') {
            if (isFile) return code._405('GET');

            try {
                return apiMap[url](request.query, request.headers, body);
            } catch (err) {
                return code._400(err?.message || String(err));
            }
        }

        // 错误处理
        else return code._500();
    });

    LogG.info('HTTP 服务器启动成功, 网址: http://localhost:' + SettingsG.net.port ?? 8080);

    // 主循环
    while (true) {
        net.poll();
        // 释放 CPU 控制权
        await os.sleepAsync(1);
    }
}

export { startServer };