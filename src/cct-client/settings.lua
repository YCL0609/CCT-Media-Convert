-- SPDX-License-Identifier: GPL-2.0-or-later
-- Copyright (C) 2026 YCL

---@diagnostic disable: undefined-field, undefined-global
local w, h = term.getSize()
local isColor = term.isColor()

-- 文本居中
local function centerText(text, width, default)
    text = text or default or ""
    if #text >= width then
        return string.sub(text, 1, width)
    end
    local padding = width - #text
    local left = math.floor(padding / 2)
    return string.rep(" ", left) .. text .. string.rep(" ", padding - left)
end

-- 错误打印
local function printError(line, message)
    term.setCursorPos(1, line)
    term.clearLine()
    if isColor then term.setTextColor(colors.red) end
    term.write("X " .. message)
    if isColor then term.setTextColor(colors.white) end
end

-- 清理行
local function clearLines(...)
    for _, line in ipairs({ ... }) do
        term.setCursorPos(1, line)
        term.clearLine()
    end
end

-- 递归校验配置对象并补全默认值
local function configCheck(cfg, defCfg)
    if type(defCfg) ~= "table" then
        if type(cfg) == type(defCfg) then
            return cfg
        else
            return defCfg
        end
    end
    if type(cfg) ~= "table" then
        return defCfg
    end

    local result = {}
    for key, defaultValue in pairs(defCfg) do
        result[key] = configCheck(cfg[key], defaultValue)
    end
    return result
end

-- 配置获取和校验
local defCfg = {
    useNet = true,
    ctrlSide = "top",
    randomTime = 120,
    refreshTime = 10,
    resetSide = "left",
    imgFolder = "images",
}
local userCfg = settings.get("picSwitch")
local cfg = configCheck(userCfg, defCfg)

-- 单行显示函数
local function showLine(line, index, name, value)
    if line > h then
        return
    end
    term.setCursorPos(1, line)
    term.clearLine()

    local nameW = math.floor((w - 7) / 2)
    local valueW = w - 7 - nameW

    term.write(
        centerText(index, 5)
        .. "|"
        .. centerText(name, nameW, "Unnamed")
        .. "|"
        .. centerText(value, valueW, "nil")
    )

    if line + 1 <= h then
        term.setCursorPos(1, line + 1)
    end
end

-- 获取用户输入
local function getInput(line, txt)
    while true do
        term.setCursorPos(1, line)
        term.clearLine()
        term.write(txt)
        local inTxt = read()
        if inTxt ~= "" then
            return inTxt
        end
    end
end

-- 控制屏幕
local function changeCtrlSide()
    while true do
        local name = getInput(11, "Enter monitor name >> ")
        local obj = peripheral.wrap(name)
        if obj and peripheral.getType(name) == "monitor" then
            obj.setTextScale(1)
            local cw, ch = obj.getSize()
            if cw == 29 and ch == 5 then
                cfg.ctrlSide = name
                break
            end
            printError(9, "Monitor size must be 29x5")
        else
            printError(9, "Not a monitor")
        end
    end
    clearLines(11)
    showLine(3, "1", "Ctrl Side", cfg.ctrlSide)
    return true
end

-- 重置信号
local function changeResetSide()
    while true do
        local name = getInput(11, "Enter side name >> ")
        clearLines(12, 9)
        term.setCursorPos(1, 12)
        term.write("Please send the signal from this side within 30s")

        local success = false
        parallel.waitForAny(
            function()
                os.sleep(10)
            end,
            function()
                while true do
                    os.pullEvent("redstone")
                    if redstone.getInput(name) then
                        success = true
                        break
                    end
                end
            end
        )

        if success then
            clearLines(12, 11)
            cfg.resetSide = name
            break
        end

        printError(9, "Verification failed")
    end
    showLine(4, "2", "Reset Side", cfg.resetSide)
    return true
end

-- 图片文件夹
local function changeImgFolder()
    while true do
        local name = getInput(11, "Enter Folder name >> ")
        if string.match(name, "^[%w_%-]+$") then
            cfg.imgFolder = name
            break
        end
        printError(9, "Verification failed")
    end
    clearLines(11)
    showLine(5, "3", "Img Folder", cfg.imgFolder)
    return true
end

-- 数字验证
local function getValidNumber(line, prompt)
    while true do
        local value = getInput(line, prompt)
        local num = tonumber(value)
        if num ~= nil then
            return num
        end
        printError(9, "Verification failed")
    end
end

-- 随机间隔
local function changeRandomTime()
    term.setCursorPos(1, 11)
    term.clearLine()
    term.write("A positive number switches randomly,")
    term.setCursorPos(1, 12)
    term.clearLine()
    term.write("0 disables, and a negative number switches in order.")

    cfg.randomTime = getValidNumber(13, "Enter number >> ")
    clearLines(11, 12, 13)
    showLine(6, "4", "Random", cfg.randomTime .. " s")
    return true
end

-- 刷新间隔
local function changeRefreshTime()
    term.setCursorPos(1, 11)
    term.clearLine()
    term.write("Enter 0 means disabled")

    cfg.refreshTime = getValidNumber(12, "Enter number >> ")
    clearLines(11, 12)
    showLine(7, "5", "Refresh", cfg.refreshTime .. " s")
    return true
end

-- 是否启用网络
local function changeUseNet()
    term.setCursorPos(1, 11)
    term.clearLine()
    term.write("0 disabled, 1 enabled")

    while true do
        local value = getInput(12, "Enter status >> ")
        local num = tonumber(value)
        if num == 1 then
            cfg.useNet = true
            break
        elseif num == 0 then
            cfg.useNet = false
            break
        end
        printError(9, "Verification failed")
    end

    clearLines(11, 12)
    showLine(8, "6", "Use Net", tostring(cfg.useNet))
    return true
end

-- 映射
local handlers = {
    [1] = changeCtrlSide,
    [2] = changeResetSide,
    [3] = changeImgFolder,
    [4] = changeRandomTime,
    [5] = changeRefreshTime,
    [6] = changeUseNet,
}

-- 初始化渲染
term.clear()
showLine(1, "No.", "Name", "Value")
term.write(string.rep('-', w))
showLine(3, "1", "Ctrl Side", cfg.ctrlSide)
showLine(4, "2", "Reset Side", cfg.resetSide)
showLine(5, "3", "Img Folder", cfg.imgFolder)
showLine(6, "4", "Random", cfg.randomTime .. " s")
showLine(7, "5", "Refresh", cfg.refreshTime .. " s")
showLine(8, "6", "Use Net", tostring(cfg.useNet))

-- 等待输入
local isExit = false
repeat
    term.setCursorPos(1, 9)
    term.clearLine()
    term.write("Enter '*end' to quiet and save settings.")
    local id = getInput(10, "Enter ID that you want to change >> ")
    if id == "*end" then
        isExit = true
    else
        term.setCursorPos(1, 9)
        term.clearLine()
        local num = tonumber(id)
        if num and num > 0 and num < 7 then
            handlers[num]()
        end
    end
until isExit

-- 结束
settings.set("picSwitch", cfg)
settings.save()
term.clear()
term.setCursorPos(1, 1)
term.write("Settings saved.")
term.setCursorPos(1, 2)
