import * as os from "qjs:os"
import * as std from "qjs:std"

// 帮助信息
if (scriptArgs.length > 1 && (scriptArgs[1] === "-h" || scriptArgs[1] === "--help")) {
    print(`将视频转换为 CC:T 可用的 32vid (.32v) 分段视频文件 (v0.5)

选项:
  -h, --help     显示此帮助信息并退出

程序同目录的 config.json 可覆盖默认生成的配置。
`); std.exit(0);
}

function printf(content) {
    std.out.printf(content);
    std.out.flush();
}

function errorExit(text, id) {
    if (id !== void 0) text += " - Code: " + id;
    print("[Error] " + text);
    std.exit(1);
}

const sep = os.platform === "win32" ? "\\" : "/";

const scriptDir = (() => {
    const [scriptPath, err] = os.realpath(scriptArgs[0]);
    if (err !== 0 || !scriptPath) errorExit("无法解析程序路径: " + scriptArgs[0]);
    return scriptPath.substring(0, scriptPath.lastIndexOf(sep));
})();

const config = (() => {
    try {
        const rawCfg = {
            ffmpeg: joinPath(scriptDir, "ffmpeg", "bin", "ffmpeg"),
            sanjuuni: joinPath(scriptDir, "sanjuuni", "sanjuuni.exe"),
            inputDir: joinPath(scriptDir, "input"),
            outputDir: joinPath(scriptDir, "output"),
            logFile: joinPath(scriptDir, "log.txt"),
            screen: {
                cols: 4,
                rows: 3,
                baseW: 164,
                baseH: 123,
            },
            // 32vid 建议使用 -k(kmeans) 或 -O(ordered)。若要静音可加 "-m"，压缩音频加 "-d"
            sanjuuniArgs: ["-k", "-L", "-O", "-d"]
        }
        const file = joinPath(scriptDir, 'config.json');
        const [_, err] = os.stat(file);
        let cfg;
        if (err === 0) {
            const fileText = std.loadFile(file);
            if (fileText === null) errorExit("无法读取config.json: " + std.strerror(err));
            let overwrite;
            try { overwrite = JSON.parse(fileText); } catch (e) { errorExit("无法解析 config.json: " + e.message); }
            cfg = {
                ...rawCfg,
                ...overwrite,
                screen: { ...rawCfg.screen, ...(overwrite?.screen || {}) }
            };
        } else {
            cfg = rawCfg;
        }
        return cfg;
    } catch (e) {
        errorExit("核心配置生成错误! - " + e.message)
    }
})();

function joinPath(...parts) {
    return parts.filter(p => p && typeof p === 'string').join(sep).replace(/[\\/]+/g, sep);
}

function getExtsFileList(dir, exts) {
    let results = [];
    const [list, err] = os.readdir(dir);
    if (err !== 0) errorExit(`无法打开文件夹: ${std.strerror(2)} Path: ${dir}`);
    const extSet = new Set(exts.map(e => e.toLowerCase()));
    for (const entry of list) {
        if (entry === "." || entry === "..") continue;
        const fullPath = joinPath(dir, entry);
        const [stat, err] = os.stat(fullPath);
        if (err !== 0 || !stat) continue;
        if ((stat.mode & 0o170000) !== 0o040000) {
            const lastDotIndex = entry.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const ext = entry.substring(lastDotIndex).toLowerCase();
                if (extSet.has(ext)) results.push(fullPath);
            }
        }
    }
    return results;
}

function execToLog(args) {
    const cmdLine = args.map(arg => arg.includes(" ") ? `"${arg}"` : arg).join(" ");
    const logFile = std.open(config.logFile, "ab");
    if (!logFile) errorExit("\n无法打开日志文件");
    let exitCode = 0;
    const pipe = std.popen(cmdLine + " 2>&1", "r");
    if (pipe) {
        while (true) {
            let line = pipe.getline();
            if (line === null) break;
            logFile.puts(line + "\n");
            logFile.flush();
        }
        const rawCode = pipe.close();
        exitCode = (os.platform !== "win32" && rawCode > 255) ? (rawCode >> 8) : rawCode;
    }
    logFile.close();
    return exitCode;
}

function writeFile(content, file, sign) {
    const fd = std.open(file, sign)
    if (fd === null) errorExit("无法打开文件写入! - Path: " + file)
    fd.puts(content)
    fd.close()
}

// 主逻辑
try {
    print("使用配置: " + JSON.stringify(config) + "\n")

    os.mkdir(config.inputDir);
    os.mkdir(config.outputDir);

    const videoFiles = getExtsFileList(config.inputDir, ['.mp4', '.mkv', '.avi', '.mov'])
    print("扫描到 " + videoFiles.length + " 个视频文件。")
    let videoCount = 1;

    for (const video of videoFiles) {
        const basename = video.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
        const ext = video.substring(video.lastIndexOf('.'));
        const videoOutputDir = joinPath(config.outputDir, basename);

        // 计算整个矩阵的总像素宽高
        const targetW = config.screen.cols * config.screen.baseW;
        const targetH = config.screen.rows * config.screen.baseH;

        os.mkdir(videoOutputDir);

        print("---------------------------------------")
        print(`处理视频 [${videoCount}/${videoFiles.length}]: ${basename}${ext}`);

        // 创建临时时间切片文件夹
        const tempSegDir = joinPath(videoOutputDir, "_temp_segments");
        os.mkdir(tempSegDir);

        // 1. FFmpeg：缩放、裁剪，并按每 5 秒切碎成一个小视频
        printf(" -> (1/2) FFmpeg 正在进行画面裁剪并按每 5 秒切片...\n");
        const code0 = execToLog([
            config.ffmpeg,
            "-i", video,
            "-r", "10",
            "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1`,
            "-f", "segment",
            "-g", "100",      
            "-sc_threshold", "0", 
            "-segment_time", "2",
            "-reset_timestamps", "1",
            "-y", joinPath(tempSegDir, `seg_%03d${ext}`)
        ]);
        if (code0 !== 0) errorExit("FFmpeg 时间切片失败", code0);

        // 获取切碎后的视频段列表
        const segFiles = getExtsFileList(tempSegDir, [ext]).sort();
        print(`    已切碎为 ${segFiles.length} 个时间片段，开始转换为 32vid 格式...`);

        // 2. 循环将每个时间段转换为单独的 .32v 文件
        let a = 0
        for (let s = 0; s < segFiles.length; s++) {
            const segPath = segFiles[s];
            // 最终输出文件名类似于：part_1.32v, part_2.32v
            const final32vFile = joinPath(videoOutputDir, `part_${s + 1}.32v`);

            os.remove(final32vFile);
            printf(`    [片段 ${s + 1}/${segFiles.length}] 正在生成 32vid...`);



// .\sanjuuni\sanjuuni.exe -i .\output\0\_temp_segments\seg_002.mp4 -3 -M8x6 -W 1310 -H 727 -o part_1.32vid





            // 调用 sanjuuni 并带有 -3 参数
            print(`-M${config.screen.cols}x${config.screen.rows}`)
            const code1 = execToLog([
                config.sanjuuni,
                "-i", segPath,
                "-m",
                "-W", String(targetW),
                "-H", String(targetH),
                "--trim-borders",
                `-M${config.screen.cols - 1}x${config.screen.rows - 1}@1`,
                "-3",
                "-o", final32vFile,
                ...(config.sanjuuniArgs || [])
            ]);

            if (code1 !== 0) {
                os.remove(segPath);
                errorExit(`Sanjuuni 转换 32vid 片段 part_${s + 1} 失败`, code1);
            }

            os.remove(segPath);
        }

        // 清理临时文件夹
        os.remove(tempSegDir);

        // 3. 生成索引文件，方便 CC:T 主控端按顺序读取分段播放
        const segmentIndex = {
            totalParts: segFiles.length,
            durationPerPart: 5,
            format: "32vid",
            screenMatrix: {
                cols: config.screen.cols,
                rows: config.screen.rows,
                totalWidth: targetW,
                totalHeight: targetH
            },
            parts: Array.from({ length: segFiles.length }, (_, i) => `part_${i + 1}.32v`)
        };
        writeFile(JSON.stringify(segmentIndex, null, 2), joinPath(videoOutputDir, "segments_index.json"), "wb");

        print(`\r视频 [${basename}] 32vid 分段转换成功！\n`);
        videoCount++;
    }
} catch (e) {
    errorExit("文件处理错误! - " + e.message);
}