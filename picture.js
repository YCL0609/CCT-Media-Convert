import * as os from "qjs:os"
import * as std from "qjs:std"

// 帮助信息
if (scriptArgs.length > 1 && (scriptArgs[1] === "-h" || scriptArgs[1] === "--help")) {
    print(`####`);
    std.exit(0);
}

function printf(content) {
    std.out.printf(content);
    std.out.flush();
}

// 错误退出
function errorExit(text, id) {
    if (id !== void 0) text += " - Code: " + id;
    print("[Error] " + text);
    std.exit(1);
}

// init.lua
const initLua = `@@@@`;

// 路径分隔符
const sep = os.platform === "win32" ? "\\" : "/";

// 脚本所在目录
const scriptDir = (() => {
    const [scriptPath, err] = os.realpath(scriptArgs[0]);
    if (err !== 0 || !scriptPath) errorExit("无法解析程序路径: " + scriptArgs[0]);
    return scriptPath.substring(0, scriptPath.lastIndexOf(sep));
})();

// 用户配置
const config = (() => {
    try {
        const rawCfg = {
            ffmpeg: joinPath(scriptDir, "ffmpeg", "bin", "ffmpeg"),
            sanjuuni: joinPath(scriptDir, "sanjuuni-cli", "sanjuuni"),
            inputDir: joinPath(scriptDir, "input"),
            outputDir: joinPath(scriptDir, "output"),
            logFile: joinPath(scriptDir, "log.txt"),
            screen: {
                width: 4,
                height: 3,
                cellWidth: 164,
                cellHeight: 81,
            },
            keptSegImg: false,
            sanjuuniArgs: ["-k", "-L", "-O"]
        }
        const file = joinPath(scriptDir, 'config.json');
        const [_, err] = os.stat(file);
        let cfg;
        if (err === 0) {
            const fileText = std.loadFile(file);
            if (fileText === null) errorExit("无法读取config.json: " + std.strerror(err));
            let overwrite;
            try {
                overwrite = JSON.parse(fileText);
            } catch (e) {
                errorExit("无法解析 config.json: " + e.message);
            }
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

// 路径映射
function joinPath(...parts) {
    return parts
        .filter(p => p && typeof p === 'string')
        .join(sep)
        .replace(/[\\/]+/g, sep);
}

// 递归扫描目录中指定扩展名的文件
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
        if ((stat.mode & 0o170000) !== 0o040000) { // 仅处理文件
            const lastDotIndex = entry.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const ext = entry.substring(lastDotIndex).toLowerCase();
                if (extSet.has(ext)) {
                    results.push(fullPath);
                }
            }
        }
    }
    return results;
}

// 执行程序并重定向输出到文件
function execToLog(args) {
    const cmdLine = args.map(arg => arg.includes(" ") ? `"${arg}"` : arg).join(" ");

    // 打开日志文件（追加模式）
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

// 写入文件
function writeFile(content, file, sign) {
    const fd = std.open(file, sign)
    if (fd === null) errorExit("无法打开文件写入! - Path: " + file)
    fd.puts(content)
    fd.close()
}

// 主逻辑
try {
    print("使用配置: " + JSON.stringify(config) + "\n")

    // 确保目录存在
    const dir0 = os.mkdir(config.inputDir);
    if (dir0 !== -17 && dir0 !== 0) errorExit("输入文件夹创建错误 - Code: " + std.strerror(dir0));
    const dir1 = os.mkdir(config.outputDir);
    if (dir1 !== -17 && dir1 !== 0) errorExit("输出文件夹创建错误 - Code: " + std.strerror(dir1));

    // 文件存在确认
    const [_1, file0] = os.stat(config.ffmpeg);
    if (file0 != 0) errorExit("无法获取ffmpeg程序详细信息, 请确保文件存在.");
    const [_2, file1] = os.stat(config.sanjuuni);
    if (file1 != 0) errorExit("无法获取sanjuuni程序详细信息, 请确保文件存在.");

    // 图片处理
    const imgFiles = getExtsFileList(config.inputDir, ['.jpg', '.png', '.jpeg'])
    print("扫描到 " + imgFiles.length + " 个图片文件。")
    let imgCount = 1;
    for (const img of imgFiles) { // 循环处理所有图片
        const basename = img.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
        const ext = img.substring(img.lastIndexOf('.'));
        const imageOutputDir = joinPath(config.outputDir, basename);
        const totalCount = config.screen.rows * config.screen.cols;
        const targetW = config.screen.cols * config.screen.baseW;
        const targetH = config.screen.rows * config.screen.baseH;
        const dirOut = os.mkdir(imageOutputDir);
        if (dirOut !== -17 && dirOut !== 0) errorExit("输出文件夹创建错误 - Code: " + std.strerror(dirOut));

        print("---------------------------------------")
        print("处理图片" + imgCount + ": " + basename + ext);
        let sepCount = 1;

        // 切片与 Lua 转换
        for (let y = 0; y < config.screen.rows; y++) {
            for (let x = 0; x < config.screen.cols; x++) {
                const tileX = x + 1;
                const tileY = y + 1;
                const offX = x * config.screen.baseW;
                const offY = y * config.screen.baseH;
                const tilePath = joinPath(imageOutputDir, `temp_${tileX}_${tileY}${ext}`);
                const outputFile = joinPath(imageOutputDir, `${tileX}_${tileY}.32v`);
                os.remove(tilePath);
                os.remove(outputFile);

                // FFmpeg 切片
                printf((`\r${sepCount}/${totalCount} - x:${tileX} y:${y + 1} (1/3, FFmpeg)`).padEnd(40, " "))
                const code0 = execToLog([
                    config.ffmpeg,
                    "-i", img,
                    "-vf", `scale=${targetW}:${targetH},setsar=1,crop=${config.screen.baseW}:${config.screen.baseH}:${offX}:${offY}`,
                    "-y", tilePath
                ]);
                if (code0 !== 0) errorExit("FFmpeg 处理失败", code0);


                // Sanjuuni 转换
                printf((`\r${sepCount}/${totalCount} - x:${tileX} y:${tileY} (2/3, Sanjuuni)`).padEnd(40, " "))
                const code1 = execToLog([
                    config.sanjuuni,
                    "-i", tilePath,
                    "-3",
                    "-W", String(config.screen.baseW),
                    "-H", String(config.screen.baseH),
                    "-o", outputFile,
                    ...(config.sanjuuniArgs || [])
                ]);
                if (code1 !== 0) errorExit("Sanjuuni 处理失败", code1);

                // 处理生成的 Lua 文件
                // printf((`\r${sepCount}/${totalCount} - x:${tileX} y:${tileY} (3/3, Lua)`).padEnd(40, " "))
                // const rawLua = std.loadFile(outputFile);
                // if (rawLua === null) errorExit("无法打开生成的lua文件进行二次处理", 5);
                // const index = rawLua.indexOf("sleep(0.04)");
                // const cuttedContent = index >= 0 ? rawLua.substring(0, index) : rawLua;

                // const header = `local monitor_id = _G.picMonMap[${tileX}][${tileY}]\nlocal term = peripheral.wrap(monitor_id)\nif not term then error('Monitor not found: ' .. tostring(monitor_id)) end\n`;

                // const finalLua = header + "\n" + cuttedContent.trim();
                // writeFile(finalLua, outputFile, "wb");

                // 删除分割的图片
                if (!config.keptSegImg) os.remove(tilePath);

                sepCount++;
            }
        }

        // 生成 init.lua
        writeFile(initLua, joinPath(imageOutputDir, "init.lua"), "wb");

        // 生成 config.json
        const finalData = [];
        for (let x = 1; x <= config.screen.cols; x++) {
            const col = [];
            for (let y = 1; y <= config.screen.rows; y++) {
                col.push(`${x}_${y}`);
            }
            finalData.push(col);
        }
        writeFile(JSON.stringify(finalData, null, 2), joinPath(imageOutputDir, "config.json"), "wb");

        print(("\r图片" + imgCount + "处理成功!").padEnd(40, " "));
        imgCount++
    }
} catch (e) {
    errorExit("文件处理错误! - " + e.message);
}