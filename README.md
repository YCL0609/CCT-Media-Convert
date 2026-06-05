# CCT-Media-Convert

中文版: [README_ZH.md](README_ZH.md)<br>
*In the event of any discrepancy between the English and Chinese versions, the Chinese version shall prevail.*

A tool to convert images into formats usable by ComputerCraft: Tweaked monitors.

It supports both folder mode and single-file mode inputs. (TODO) When started without arguments, it launches a local HTTP service and opens a browser interface for visual operation.

***Note: Because QuickJS on Windows uses `msvcrt` to access the file system, handling paths containing non-ASCII characters may exhibit undefined behavior. I currently do not have the ability to maintain or fix large C projects, so this is not fixed yet.***

## Command-line Arguments
```
Usage:
  <Program> [-d | -f] -i <input> -o <output> [options]

Options:
  -h, --help                  Show this help information
  -d, --dir                   Folder mode (default, mutually exclusive with -f)
  -f, --file                  Single-file mode (mutually exclusive with -d)
  -i, --input <path>          Input directory/file path (default: ./input)
  -o, --output <path>         Output directory/file path (default: ./output)
  -l, --logDir <path>         Log file path (default: ./logs folder)
  -c, --config <path>         Program configuration file path (default: ./config.json)
  -M[WxH], --matrix=[WxH]     Display matrix size (default: 4x3)
  -S[WxH], --cellsize=[WxH]   Single display pixel size (default: 164x81)
  -t[count], --thread=[count] Number of threads to use (default: 2)
  --sanjuuniArgs="Args"       Additional arguments passed to sanjuuni (default: "-k -L -O -3")
  --gui                       Use GUI mode ( -- not implemented yet -- )
  --api                       Use API mode ( -- not implemented yet -- )
```

## Build
**Currently only supported on Linux**

1. Initialize the project
   ```bash
   # Node.js must be installed separately
   pacman -S cmake musl mingw-w64-gcc gawk git
   git clone https://github.com/YCL0609/CCT-Media-Convert.git
   cd CCT-Media-Convert
   git submodule update --init --recursive
   npm install
   ```
2. Build the project:
   ```bash
   # 1. Build the main QuickJS runtime
   ./script/01-build-qjsc.sh

   # 2. Pre-build QuickJS modules
   ./script/02-build-qjsMods.sh

   # 3. Build core code into dist/core.c
   ./script/03-build-core.sh

   # 4. Compile the final executable
   ./script/04-build-app.sh
   ```
3. Build output artifacts
   ```
   dist/quickjs/build-linux   --- QuickJS Linux runtime
   dist/quickjs/build-win     --- QuickJS Windows runtime
   dist/app-linux             --- Linux executable
   dist/app-win.exe           --- Windows executable
   dist/core.c                --- Generated C source from step 3
   dist/core.js               --- Minified JS code
   dist/resources.c           --- Pre-built output from step 2
   ```
