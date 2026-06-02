// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 YCL

import { Log, Settings } from './libs/index.js';
import { imagePerProcess } from './picture.js';
import { videoPerProcess } from './video.js';
import * as std from 'qjs:std';
import * as os from 'qjs:os';

const args = scriptArgs.slice(1);

function startServer(params) {
    print('   ' + params + ' 模式暂未实现, 请使用参数指定处理, 使用"-h"显示帮助')
}

// GUI模式
if ((args[0] ?? '--gui') === '--gui' && args.length <= 1) startServer('GUI');

// API模式
else if ((args[0] ?? '--api') === '--api' && args.length <= 1) startServer('API');

// 帮助输出
else if (args.includes('-h') || args.includes('--help')) {
    const rawText = "aaa  $NAME$";
    // const rawText = getREs('helpText');
    const appName = (scriptArgs[0] || '').split(/[\\/]/).pop() || '<Program>';
    std.out.puts(rawText.replace('$NAME$', appName));
    std.out.flush();
    std.exit(0);
}

// CLI模式
else {
    function process(args) {
        const wait = args.wait.size;
        const processing = args.processing.size;
        const finish = args.finish.size;
        const ignore = args.ignore.size;
        Log.info('wait:', wait, 'processing:', processing, 'finish', finish, 'ignore', ignore);
    }

    const cfg = Settings.get();
    if (cfg.isImage) imagePerProcess(process);
    else videoPerProcess(process, process);
}