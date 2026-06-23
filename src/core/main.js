// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

import { errorExit, exitApp, Log, Settings } from './libs/index.js';
import { initGlobals, LogG, SettingsG } from './global.js';
import { imagePerProcess } from './runner/picture.js';
import { startServer } from './net/server.js';
import { getSource } from 'qjsa:resources';
import * as std from 'qjs:std';
import * as os from 'qjs:os';

// 帮助文本输出
if (scriptArgs.includes('-h') || scriptArgs.includes('--help')) {
    const appName = (os.exePath() || '').split(/[\\/]/).pop() || '<Program>';
    const rawText = getSource('helpText')
        .replace('$VERSION$', getSource('version'))
        .replace('$NAME$', appName);
    std.out.puts(rawText);
    std.out.flush();
    std.exit(0);
}

try {
    const settings = new Settings();
    const log = new Log(settings.sep, settings.logDir, settings.debug);
    initGlobals(log, settings);
} catch (err) {
    errorExit('初始化错误: ' + err?.message || String(err));
}
LogG.debug('使用配置:', JSON.stringify(SettingsG))

async function main() {
    switch (SettingsG.mode) {
        // CLI模式
        case 0:
            LogG.debug('使用 CLI 模式')
            return imagePerProcess(() => { });

        // GUI模式
        case 1:
            LogG.debug('使用 GUI 模式')
            return startServer('GUI');

        // API模式
        case 2:
            LogG.debug('使用 API 模式')
            return startServer('API')

        default: throw new Error('模式错误: 未知模式ID ' + cfg.mode);
    }
}

main()
    .then(exitApp)
    .catch(err => errorExit('运行错误: ' + (err?.message || String(err))));