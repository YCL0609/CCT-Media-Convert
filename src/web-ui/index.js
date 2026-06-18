// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

const processBar = document.getElementById('processBar');
const apiStatusE = document.getElementById('APIStatus');
const JobStatusE = document.getElementById('JobStatus');
const multipleE = document.getElementById('multiple');
const noteDivE = document.getElementById('noteDiv');
const imgListE = document.getElementById('imgList');
const uploadPE = document.getElementById('uploadP');
const singleE = document.getElementById('single');
const uploadE = document.getElementById('upload');
const deleteE = document.getElementById('delete');

const defImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='1'><rect width='18' height='18' x='3' y='3' rx='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/></svg>`;
const baseUrl = location.origin;
const selented = new Set();
const imgMIME = {
    ['jpg']: 'image/jpeg',
    ['jpeg']: 'image/jpeg',
    ['png']: 'image/png',
};
const statusMap = {
    0: {
        class: 'status',
        job: '未知',
        api: 'API 状态未知',
    },
    1: {
        class: 'status offline',
        job: '忙碌',
        api: 'API 离线',
    },
    2: {
        class: 'status online',
        job: '空闲',
        api: 'API 在线',
    }
};

let pingErr = 0;
let offline = true;
let inRunning = false;
let onShowStatus = false;

// 进度显示文字
function showProcess({ finish = 0, processing = 0, ignore = 0, wait = 1 } = {}) {
    const total = finish + processing + ignore + wait;
    const pctFinish = total ? (finish / total) * 100 : 0;
    const pctProcessing = total ? (processing / total) * 100 : 0;
    const pctIgnore = total ? (ignore / total) * 100 : 0;
    const pctWait = total ? (wait / total) * 100 : 0;

    processBar.style.setProperty('--w-finish', `${pctFinish}%`);
    processBar.style.setProperty('--w-processing', `${pctProcessing}%`);
    processBar.style.setProperty('--w-ignore', `${pctIgnore}%`);
    processBar.style.setProperty('--w-wait', `${pctWait}%`);
}

// 显示状态信息
function statusToHTML(api, job) {
    function toHTML(el, classN, text) {
        el.className = classN;
        el.innerText = text;
    }

    const jobcfg = statusMap[job];
    const apicfg = statusMap[api];

    switch (api) {
        case 0:
            offline = true;
            document.querySelectorAll('button').forEach(e => e.disabled = true);
            toHTML(JobStatusE, apicfg.class, apicfg.job);
            toHTML(apiStatusE, apicfg.class, apicfg.api);
            showNote('warn', '无法探测后端 API 状态');
            showNote('warn', '无法探测后端运行状态');
            return;

        case 1:
            offline = true;
            document.querySelectorAll('button').forEach(e => e.disabled = false);
            toHTML(JobStatusE, apicfg.class, apicfg.job);
            toHTML(apiStatusE, apicfg.class, apicfg.api);
            showNote('error', '后端 API 离线');
            return;

        case 2:
            offline = false;
            document.querySelectorAll('button').forEach(e => e.disabled = false);
            toHTML(apiStatusE, apicfg.class, apicfg.api);
            showNote('info', '连接到后端 API');
            break;

        default: break;
    }

    switch (job) {
        case 0:
            toHTML(JobStatusE, jobcfg.class, jobcfg.job);
            showNote('warn', '无法探测后端运行状态');
            break;
        case 1:
            toHTML(JobStatusE, jobcfg.class, jobcfg.job);
            showNote('warn', '后端进入忙碌状态');
            break;
        case 2:
            toHTML(JobStatusE, jobcfg.class, jobcfg.job);
            showNote('info', '后端进入空闲状态');
            break;

        default: break;
    }

}

// 提示信息显示
function showNote(level, text) {
    if (level !== 'info' && level !== 'warn' && level !== 'error') return;
    const container = document.querySelector('.note-container');
    const note = document.createElement('div');
    const span = document.createElement('span');
    const btn = document.createElement('button');

    note.className = `note note-${level}`;
    span.className = 'note-text';
    btn.className = 'note-close';

    btn.innerText = '\u00d7';
    span.innerText = text;

    note.appendChild(span);
    note.appendChild(btn);
    container.appendChild(note);

    // 点击关闭
    btn.onclick = () => {
        note.classList.add('removing');
        note.addEventListener('animationend', () => note.remove(), { once: true });
    };

    // 5秒后自动关闭
    setTimeout(() => {
        if (note.parentNode) {
            note.classList.add('removing');
            note.addEventListener('animationend', () => note.remove(), { once: true });
        }
    }, 5000);
}

// 后端状态获取函数
function showStatus() {
    if (onShowStatus) return;
    onShowStatus = true;
    let showError = true;
    let showInfo = true;
    let timmer = null;
    timmer = setInterval(async () => {
        try {
            const response0 = await fetch(baseUrl + '/api/job/status', { method: 'POST' });
            if (!response0.ok) throw new Error('Http code ' + response0.status);
            const data = await response0.json();
            inRunning = data.inRunning;
            if (data.inError) {
                showNote('error', '后端错误信号触发');
                statusToHTML(-1, 0);
                clearInterval(timmer);
                // 发送错误清空请求
                const response1 = await fetch(baseUrl + '/api/job/cleanError', { method: 'POST' });
                if (response1.status !== 204) showNote('warn', '重置后端错误信号失败');
                inRunning = false;
                return;
            }

            // 进度显示
            if (data.inRunning) {
                if (showInfo) {
                    showInfo = false;
                    statusToHTML(-1, 1);
                }
                showProcess({
                    finish: data.finish.length,
                    ignore: data.ignore.length,
                    processing: data.processing.length,
                    wait: data.wait.length,
                });
            } else {
                statusToHTML(-1, 2);
                showProcess();
                clearInterval(timmer);
            };
        } catch (_) {
            if (showError) {
                statusToHTML(-1, 0);
                showNote('error', '后端状态获取失败: ' + err.message);
                showError = false;
            }
        }
    }, 2000);
    onShowStatus = false;
}

// 将input文件夹内图像映射到页面
async function inputDirShow() {
    imgListE.innerHTML = '';

    // 获取列表
    let list;
    try {
        const response = await fetch(baseUrl + '/api/fs/list', {
            method: 'POST',
            headers: {
                'Data-Type': 'json',
            },
            body: JSON.stringify({
                exts: '.jpg,.jpeg,.png',
                path: JSON.stringify(['input']),
            })
        });
        if (!response.ok) return showNote('error', '后端报告无法扫描文件夹: Code ' + response.status);
        list = await response.json();
    } catch (err) {
        showNote('error', '无法拉起后端: ' + err.message);
    }

    // 并行获取数据生成元素列表
    const fragment = document.createDocumentFragment();
    const cards = await Promise.all(list.map(async name => {
        try {
            const response = await fetch('/api/fs/get', {
                method: 'POST',
                headers: {
                    'Data-Type': 'json',
                },
                body: JSON.stringify({
                    path: JSON.stringify(['input', name]),
                })
            });

            if (!response.ok) return null;

            // 图片解析
            const data = await response.arrayBuffer();
            const ext = name.split('.').pop();
            const blob = new Blob([data], { type: imgMIME[ext] });
            const imageUrl = URL.createObjectURL(blob);

            // 创建预览对象
            const a = document.createElement('a');
            const box = document.createElement('div');
            const div = document.createElement('div');
            const img = document.createElement('img');
            const input = document.createElement('input');

            a.className = 'image-name';
            box.className = 'image-card';
            div.className = 'img-wrapper';
            input.className = 'image-checkbox';

            a.href = '#';
            a.title = name;
            a.innerText = name;
            input.type = 'checkbox';
            input.dataset.name = name;
            img.src = imageUrl;

            img.onload = () => URL.revokeObjectURL(imageUrl);
            img.onerror = () => {
                URL.revokeObjectURL(imageUrl);
                img.onload = null;
                img.src = defImg;
                img.onerror = null;
            };

            div.appendChild(img);
            box.appendChild(div);
            box.appendChild(a);
            box.appendChild(input);

            return box;
        } catch (_) {
            showNote('error', '加载图片失败: ' + name);
            return null;
        }
    }));

    // 过滤并组装 DOM 节点
    cards
        .filter(card => card !== null)
        .forEach(card => fragment.appendChild(card));
    imgListE.appendChild(fragment);
}

// 刷新列表
document.getElementById('refresh').addEventListener('click', inputDirShow);

// 删除选定
document.getElementById('delete').addEventListener('click', async (event) => {
    const btnE = event.currentTarget;
    btnE.disabled = true;

    // 收集要删除的元素
    const selectedItems = [];
    const checkedInputs = document.querySelectorAll('input.image-checkbox:checked');
    for (const el of checkedInputs) {
        const name = el.dataset.name;
        const cardEl = el.parentNode;
        if (name && cardEl) {
            selectedItems.push({
                payload: JSON.stringify(['input', name]),
                cardEl: cardEl
            });
        }
    }

    // 检查是否有选中项
    if (selectedItems.length === 0 || !confirm('确定删除选定图片吗?')) {
        btnE.disabled = false;
        return;
    }

    // 提取后端所需的 payload
    const list = selectedItems.map(item => item.payload);
    try {
        // 发送请求
        const response = await fetch(baseUrl + '/api/fs/del', {
            method: 'POST',
            headers: {
                'Data-Type': 'json',
            },
            body: JSON.stringify(list),
        });

        if (response.ok) {
            showNote('info', '删除成功');
            // 清理 DOM
            selectedItems.forEach(item => item.cardEl.remove());
        } else {
            showNote('error', '删除失败: Code ' + response.status);
        }
    } catch (error) {
        console.error('删除请求失败:', error);
        showNote('error', '网络错误，删除失败');
    } finally {
        btnE.disabled = false;
    }
});

// 处理选定
document.getElementById('dojob').addEventListener('click', async (event) => {
    if (inRunning) return;
    inRunning = true;
    const btnE = event.currentTarget;
    btnE.disabled = true;

    // 获取选择列表
    const list = [];
    for (const el of document.querySelectorAll('input:checked')) {
        const name = el.dataset.name;
        if (name) list.push(name);
    }
    if (list.length === 0) {
        btnE.disabled = false;
        inRunning = false;
        return;
    }

    // 发送请求
    try {
        const response = await fetch(baseUrl + '/api/job/start', {
            method: 'POST',
            headers: { 'Data-Type': 'json' },
            body: JSON.stringify(list),
        });
        if (!response.ok) {
            showNote('error', '后端报告转换启动失败: Code ' + response.status);
            btnE.disabled = false;
            inRunning = false;
            return;
        }
        // 进度条显示
        showStatus();
        btnE.disabled = false;
    } catch (err) {
        showNote('error', '无法拉起后端: ' + err.message);
        btnE.disabled = false;
        inRunning = false;
    }
});

// Ping函数
setInterval(async () => {
    try {
        const response = await fetch(baseUrl + '/ping', { method: 'HEAD' });
        if (response.ok) {
            pingErr = 0;
            if (offline) {
                statusToHTML(2, -1);
                showStatus();
                selented.clear();
                inputDirShow();
            }
        } else {
            pingErr++;
            if (!offline && pingErr > 3) statusToHTML(1, -1);
        }
    } catch (_) {
        pingErr++;
        if (!offline && pingErr > 3) statusToHTML(0, -1);
    }
}, 1500)

