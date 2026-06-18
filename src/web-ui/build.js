// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'html-minifier-terser';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG = {
    inputDir: __dirname,
    outputDir: path.join(__dirname, '../../dist/web-ui'),
};

// 递归获取目录下所有特定后缀的文件
function getFiles(dir, extension, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getFiles(filePath, extension, fileList);
        } else if (filePath.endsWith(extension)) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

// 将外部 JS 和 CSS 嵌入到 HTML 字符串中
function inlineAssets(htmlText, htmlPath) {
    const htmlDir = path.dirname(htmlPath);

    // 匹配并嵌入外部 CSS
    const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']((?!http:\/\/|https:\/\/)[^"']+)["'][^>]*>/gi;
    htmlText = htmlText.replace(cssRegex, (match, cssPath) => {
        const absoluteCssPath = path.resolve(htmlDir, cssPath);
        if (fs.existsSync(absoluteCssPath)) {
            const cssContent = fs.readFileSync(absoluteCssPath, 'utf8');
            return `<style>${cssContent}</style>`;
        }
        console.warn('! 未找到 JS 文件: ' + cssPath);
        return match;
    });

    // 匹配并嵌入外部 JS
    const jsRegex = /<script\s+[^>]*src=["']((?!http:\/\/|https:\/\/)[^"']+)["'][^>]*>\s*<\/script>/gi;
    htmlText = htmlText.replace(jsRegex, (match, jsPath) => {
        const absoluteJsPath = path.resolve(htmlDir, jsPath);
        if (fs.existsSync(absoluteJsPath)) {
            const jsContent = fs.readFileSync(absoluteJsPath, 'utf8');
            return `<script>${jsContent}</script>`;
        }
        console.warn('! 未找到 JS 文件: ' + jsPath);
        return match;
    });

    return htmlText;
}

// 获取所有 HTML 文件
const htmlFiles = getFiles(CONFIG.inputDir, '.html');
if (htmlFiles.length === 0) process.exit(0);

// 确保输出目录存在
if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

// 循环处理每个 HTML
for (const filePath of htmlFiles) {
    try {
        let html = fs.readFileSync(filePath, 'utf8');

        // 执行资源内联
        html = inlineAssets(html, filePath);

        // 执行压缩
        const minifiedHtml = await minify(html, {
            collapseWhitespace: true,
            removeComments: true,
            minifyJS: {
                mangle: {
                    toplevel: true // 允许混淆顶层变量和函数名
                },
                compress: {
                    toplevel: true // 允许对顶层代码进行死代码消除和优化
                }
            },
            minifyCSS: true,
            processConditionalComments: true
        });

        // 计算输出路径并保持原有子目录结构
        const relativePath = path.relative(CONFIG.inputDir, filePath);
        const outputPath = path.join(CONFIG.outputDir, relativePath);

        // 如果有子目录，确保子目录存在
        const outputSubDir = path.dirname(outputPath);
        if (!fs.existsSync(outputSubDir)) fs.mkdirSync(outputSubDir, { recursive: true });

        // 写入文件
        fs.writeFileSync(outputPath, minifiedHtml, 'utf8');
        console.log(`O 已嵌入并压缩: ${path.basename(outputPath)} -> ${outputPath}`);
    } catch (err) {
        console.error(`X 处理文件失败 ${filePath}:`, err);
    }
}