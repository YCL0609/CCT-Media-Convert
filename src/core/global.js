// SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
// SPDX-License-Identifier: GPL-2.0-or-later

export let LogG = null;
export let SettingsG = null;

/**
 * 初始化全局状态
 * @param {object} log
 * @param {object} settings
 */
export function initGlobals(log, settings) {
    LogG = log;
    SettingsG = settings;
}
