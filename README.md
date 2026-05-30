# CCT-Media-Convert

中文版: [README_ZH.md](README_ZH.md)

A tool to convert images into Lua code suitable for ComputerCraft: Tweaked (CC:T) monitors. It uses FFmpeg to slice images and `sanjuuni` to convert each slice into Lua format, eventually generating `init.lua` and `config.json` for monitor matrices. 

*To prevent bot registrations, user sign-ups are currently closed. If you find any bugs, please contact [email@ycl.cool](mailto:email@ycl.cool).*

## Dependencies
- **Quickjs-NG** - [https://github.com/quickjs-ng/quickjs](https://github.com/quickjs-ng/quickjs)
- **FFmpeg** - [https://github.com/FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg)
- **Sanjuuni** - [https://github.com/MCJack123/sanjuuni](https://github.com/MCJack123/sanjuuni)

## Processing Workflow
1. The program scans the specified input directory for image files (`.jpg`, `.jpeg`, `.png`).
2. Calls **FFmpeg** to split the image into multiple slices based on the configured screen matrix.
3. Calls **Sanjuuni** to convert these slices into Lua files.
4. Performs post-processing on the generated Lua files for unified management.
5. Generates an output directory for each image, containing `init.lua` and a monitor configuration file `config.json`.

## Usage
1. Place the images you want to process into the `input` directory.
2. Ensure that the `ffmpeg` and `sanjuuni` executables are available and their paths are correctly set in `config.json`.
3. Run the program and wait for it to finish.
4. Edit the `config.json` file in the output directory (`output/image_name/`) and enter the corresponding **Monitor IDs** for each position.
5. Copy the image folder from the `output` directory to your CC:T storage path.
6. Run `init.lua` inside the folder. Press **Enter** to stop the display and exit.

## Configuration
The script reads `config.json` in the same directory to override default settings.
Default configuration:
```json
{
    "ffmpeg": "./ffmpeg/bin/ffmpeg",        // Path to ffmpeg
    "sanjuuni": "./sanjuuni-cli/sanjuuni",  // Path to sanjuuni
    "inputDir": "./input",                  // Input image folder
    "outputDir": "./output",                // Lua output folder
    "logFile": "./log.txt",                 // Log file path
    "keptSegImg": false,                    // Whether to keep the sliced image segments
    "sanjuuniArgs": ["-k", "-L", "-O"],     // Sanjuuni CLI arguments
    "screen": {         // Screen matrix configuration
        "cols": 4,      // Number of columns (horizontal monitors)
        "rows": 3,      // Number of rows (vertical monitors)
        "baseW": 164,   // Single monitor width (pixels)
        "baseH": 123    // Single monitor height (pixels)
    }
}