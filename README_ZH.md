# CCT-Media-Convert

English version: [README.md](README.md)

一个将图片转换为适用于 CC:T 显示器的 Lua 代码输出工具。通过 ffmpeg 对图片进行切片，再使用 sanjuuni 将每个切片转换为 Lua 格式，最后生成可用于显示器矩阵的 init.lua 和 config.json 文件。

*为防止被机器人刷用户注册本网站关闭用户注册，若项目有bug请发邮件到[email@ycl.cool](mailto:email@ycl.cool)。*

## 依赖
- Quickjs-NG - [https://github.com/quickjs-ng/quickjs](https://github.com/quickjs-ng/quickjs)
- FFmpeg - [https://github.com/FFmpeg/FFmpeg](https://github.com/MCJack123/sanjuuni)
- Sanjuuni - [https://github.com/MCJack123/sanjuuni](https://github.com/MCJack123/sanjuuni)

## 处理过程
1. 程序会扫描指定输入目录中的图片文件 (支持 .jpg, .jpeg, .png);
2. 调用 ffmpeg 将图片按配置的屏幕矩阵分割为多个图片切片;
3. 调用 sanjuuni 将切片转换为 Lua 文件;
4. 二次处理生成的 Lua 文件方便统一管理;
5. 生成每个图片的输出目录，并生成 init.lua 和显示器配置 config.json。

## 使用方法
1. 将要处理的图片放入 input 目录;
2. 确保 ffmpeg 和 sanjuuni 可执行程序可用，并在 config.json 中设置正确路径;
3. 运行程序并等待结束;
4. 编辑输出目录 "output/图片名称/" 中的 config.json 将对应的位置填入对应的显示器ID;
5. 将需要显示的图片对应的 "output/图片名称/" 文件夹复制到CC:T的存储路径并运行文件夹内的init.lua即可;
6. 运行 init.lua 后按下回车键即可退出显示。

## 配置
脚本会在同目录读取 config.json 并使用其覆盖默认设置。
默认配置如下：
```json
{
    "ffmpeg": "./ffmpeg/bin/ffmpeg",        // ffmpeg 路径
    "sanjuuni": "./sanjuuni-cli/sanjuuni",  // sanjuuni 路径
    "inputDir": "./input",                  // 要扫描的图片文件夹
    "outputDir": "./output",                // lua文件输出文件夹
    "logFile": "./log.txt",                 // 日志记录文件
    "keptSegImg": false,                    // 是否保留分割的图像
    "sanjuuniArgs": ["-k", "-L", "-O"],     // sanjuuni 命令行参数
    "screen": {         // 屏幕配置
        "cols": 4,      // 列数（水平显示器数量）
        "rows": 3,      // 行数（垂直显示器数量）
        "baseW": 164,   // 单个显示器宽度（像素）
        "baseH": 123    // 单个显示器高度（像素）
    }
}
```

### 构建说明
- **init.lua内不能使用任何形式的注释**，构建时会压缩 init.lua 的内容并替换 main.js 中的 "@@@@";
- 构建 Linux 使用的 musl-gcc 的静态构建, 若使用其他C库可自行替换 build.sh 内的命令;
- 构建 Windows 使用的 x86_64-w64-mingw32-gcc 构建需自行安装或去除win构建。