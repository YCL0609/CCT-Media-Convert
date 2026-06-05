# CCT-Media-Convert
English version: [README.md](README.md)

一个将图像转换为 ComputerCraft: Tweaked 显示器可用格式的工具。<br>
支持使用文件夹模式和单文件模式两种输入模式。(TODO) 不带参数启动时，会启动本地 HTTP 服务并打开浏览器界面进行可视化操作

***注意: 由于 QuickJS 在 Windows 平台上通过 msvcrt 访问文件系统，处理包含非 ASCII 字符的路径时，可能出现未定义行为。本人目前不具备 C 语言大项目开发或维护的能力，因此暂时无法修复。***
## 命令行参数
```
用法:
  <Program> [-d | -f] -i <input> -o <output> [选项]

选项:
  -h, --help                  显示此帮助信息
  -d, --dir                   文件夹模式 (默认, 与 -f 互斥)
  -f, --file                  单文件模式 (与 -d 互斥)
  -i, --input <路径>          输入目录/文件路径 (默认: 同目录下的input)
  -o, --output <路径>         输出目录/文件路径 (默认: 同目录下的output)
  -l, --logDir <路径>         日志文件路径 (默认: 同目录下的logs文件夹)
  -c, --config <路径>         程序配置文件路径 (默认: 同目录下的config.json)
  -M[WxH], --matrix=[WxH]     显示器矩阵大小 (默认: 4x3)
  -S[WxH], --cellsize=[WxH]   单个显示器像素大小 (默认: 164x81)
  -t[count], --thread=[count] 使用几个线程处理 (默认: 2)
  --sanjuuniArgs="Args"       调用 sanjuuni 时传入的额外参数(默认: "-k -L -O -3")
  --gui                       使用GUI模式 ( -- 暂未实现 -- )
  --api                       使用API模式 ( -- 暂未实现 -- )
```

## 构建
**目前仅支持使用`Linux`系统构建**

1. 初始化项目
   ```bash
   # 需要先自行安装node.js
   pacman -S cmake musl mingw-w64-gcc gawk git
   git clone https://github.com/YCL0609/CCT-Media-Convert.git
   cd CCT-Media-Convert
   git submodule update --init --recursive
   npm install
   ```
2. 构建项目：
   ```bash
   # 1. 构建 QuickJS 本体
   ./script/01-build-qjsc.sh

   # 2. 预构建 QuickJS 模块
   ./script/02-build-qjsMods.sh

   # 3. 构建核心代码到 dist/core.c
   ./script/03-build-core.sh

   # 4. 编译最终可执行程序
   ./script/04-build-app.sh
   ```
3. 构建生成产物
   ```
   dist/quickjs/build-linux   --- QuickJS Linux 本体
   dist/quickjs/build-win     --- QuickJS Windows 本体
   dist/app-linux             --- Linux 端可执行文件
   dist/app-win.exe           --- Windows 端可执行文件
   dist/core.c                --- 第3步生成的C代码
   dist/core.js               --- 压缩后的JS代码
   dist/resources.c           --- 第2步预构建的产物
   ```
