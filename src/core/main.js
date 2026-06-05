// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { errorExit, exitApp, Log, Settings } from './libs/index.js';
import { imagePerProcess } from './picture.js';
import { getSource } from 'cctmc:sources';
import * as std from 'qjs:std';
import * as os from 'qjs:os';

function startServer(a) {
    print('   ' + a + ' 模式暂未实现, 请使用参数指定处理, 使用"-h"显示帮助')
    os.sleep(1000)
    exitApp();
}

// 帮助文本输出
if (scriptArgs.includes('-h') || scriptArgs.includes('--help')) {
    const rawText = getSource('helpText');
    const appName = (os.exePath() || '').split(/[\\/]/).pop() || '<Program>';
    std.out.puts(rawText.replace('$NAME$', appName));
    std.out.flush();
    std.exit(0);
}

// 初始化
let cfg, logObj;
try {
    cfg = new Settings();
    logObj = new Log(cfg.sep, cfg.logDir, cfg.debug);
    globalThis.LogG = logObj;
    globalThis.SettingsG = cfg;
} catch (err) {
    errorExit('初始化错误: ' + err?.message || String(err));
}
logObj.debug('使用配置:', JSON.stringify(cfg))

async function main() {
    switch (cfg.mode) {
        // CLI模式
        case 0:
            logObj.debug('使用 CLI 模式')
            await imagePerProcess(() => { });
            break;

        // GUI模式
        case 1:
            logObj.debug('使用 GUI 模式')
            startServer('GUI');
            break;

        // API模式
        case 2:
            logObj.debug('使用 API 模式')
            startServer('API')
            break;

        default:
            throw new Error('模式错误: 未知模式ID ' + cfg.mode);
            break;
    }
}

main()
    .then(exitApp)
    .catch(err => errorExit('运行错误: ' + (err?.message + err.stack || String(err))));