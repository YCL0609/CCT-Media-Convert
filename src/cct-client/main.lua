-- SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
-- SPDX-License-Identifier: GPL-2.0-or-later

---@diagnostic disable: undefined-field, undefined-global
local currentDir = "/" .. fs.getDir(shell.getRunningProgram())
local inProcessing = false
local isDebug = false
for _, arg in ipairs(arg) do
    if arg == "--debug" then
        isDebug = true
        break
    end
end

--- 递归校验配置对象并补全默认值
--- @param cfg any 待校验配置
--- @param defCfg any 默认配置
--- @return any fcfg 校验后的配置对象
local function configCheck(cfg, defCfg)
    if cfg == nil then return defCfg end
    local cfgType = type(cfg)
    local defType = type(defCfg)

    -- 基础类型处理
    if cfgType ~= "table" then
        if cfgType == defType then
            return cfg
        else
            return defCfg
        end
    end

    -- 如果 defaultCfg 是 nil 或者不是 table, 直接返回 defaultCfg
    if defCfg == nil or defType ~= "table" then
        return defCfg
    end

    local result = {}

    -- 遍历检查
    for key, defaultValue in pairs(defCfg) do
        result[key] = configCheck(cfg[key], defaultValue)
    end

    return result
end

--- 获取指定路径下所有文件夹名称
--- @param path string 要扫描的路径
--- @return table folders 文件夹数组, 若出错则返回空
local function get32vFiles(path)
    local list = {}

    -- 检查路径本身
    if not fs.isDir(path) then return list end

    -- 获取原始文件集合
    local rawList = fs.list(path)

    -- 遍历检查
    for _, name in ipairs(rawList) do
        local fullPath = fs.combine(path, name)
        if not fs.isDir(fullPath) then
            if string.match(name, "%.32v$") or string.match(name, "%.32vid$") then
                table.insert(list, name)
            end
        end
    end

    return list
end

-- 默认配置
local defCfg = {
    useNet = true,
    imgLength = 0,
    lastIndex = 0,
    ctrlSide = "top",
    randomTime = 120,
    refreshTime = 10,
    resetSide = "left",
    imgFolder = "images",
}

-- 获取并校验配置
local userCfg = settings.get("picSwitch")
local config = configCheck(userCfg, defCfg)
if isDebug then
    print("[D] Use Configuration: " .. textutils.serialize(config))
end

-- 播放器文件校验
local playerFile = fs.combine(currentDir, "32vid-player-mini.lua")
if not fs.exists(playerFile) or fs.isDir(playerFile) then
    printError("[E] Player file not found or is a folder")
    error()
end

-- 文件夹扫描和校验
local fileList = get32vFiles(fs.combine(currentDir, config.imgFolder))
if (#fileList ~= config.imgLength) then
    config.imgLength = #fileList
    config.lastIndex = 0
    settings.save()
end
if #fileList == 0 then
    print("[I] Images list empty")
    return
end
if isDebug then print("[D] Scanned " .. #fileList .. " files") end

-- 初始化控制 UI
local mon = peripheral.wrap(config.ctrlSide)
if not mon then
    printError("Control monitor not found")
    error()
end
mon.setTextScale(4)
local w, h = mon.getSize()
local unitW = w / 3
local text = "<  O  >"
local textX = math.max(1, math.floor((w - #text) / 2) + 1)
local textY = math.floor(h / 2) + 1
mon.setBackgroundColor(colors.black)
mon.setTextColor(colors.white)
mon.clear()
mon.setCursorPos(textX, textY)
mon.write(text)

-- 加载图片函数
local function loadImage(sign)
    if inProcessing then return end
    inProcessing = true

    -- 信号处理
    if sign == "+" then
        config.lastIndex = config.lastIndex + 1
    elseif sign == "-" then
        config.lastIndex = config.lastIndex - 1
    elseif sign == "r" and #fileList > 1 then
        local newID
        repeat
            newID = math.random(1, #fileList)
        until newID ~= config.lastIndex
        config.lastIndex = newID
    end

    -- 越界检查
    if config.lastIndex < 1 then
        config.lastIndex = #fileList
    elseif config.lastIndex > #fileList then
        config.lastIndex = 1
    end

    -- 获取当前图片 ID 的路径
    local name = fileList[config.lastIndex]
    local path = fs.combine(currentDir, config.imgFolder .. "/" .. name)
    if not name or not fs.exists(path) then
        if config.lastIndex == 1 then
            printError("[E] The first image does not exist")
            error()
        end
        print("[W] Image not found switch to the first one: " .. name)
        config.lastIndex = 1
        name = fileList[1]
    end

    -- 保存索引
    settings.set("picSwitch", config)
    settings.save()

    -- 运行
    local ok, err = pcall(shell.run, playerFile, path)
    if ok then
        print("[I] Loaded image: " .. name)
    else
        print("Error loading image: " .. tostring(err))
    end


    inProcessing = false
end

-- 清理函数
local function cleanup()
    inProcessing = true
    _G.picMonMap = nil

    -- 清理控制屏幕
    mon.setBackgroundColor(colors.black)
    mon.clear()

    -- 还原显示器颜色
    local monitor_map = settings.get("sanjuuni.multimonitor") or { {} }
    local navColor = term.getPaletteColor(colors.white)
    for _, row in ipairs(monitor_map) do
        for _, id in ipairs(row) do
            local cell = peripheral.wrap(id)
            if cell then
                for i = 0, 15 do
                    cell.setPaletteColor(2 ^ i, navColor)
                end
                cell.setBackgroundColor(colors.black)
                cell.setTextColor(colors.white)
                cell.setCursorPos(1, 1)
                cell.clear()
            end
        end
    end
end

-- 图片重载任务
local function refreshImg()
    local enable = true
    local time = tonumber(config.refreshTime)
    if not time or time == 0 then
        enable = false
    elseif time < 0 then
        time = -time
    end

    while true do
        if enable then
            os.sleep(time)
            if not inProcessing then loadImage() end
        else
            -- 监控不存在事件无限期挂起
            os.pullEvent("Imashino Misaki")
        end
    end
end

-- 图片自动切换
local function autoSwitch()
    -- 配置映射
    local enable = true
    local signTxt
    local waitTime = tonumber(config.randomTime)

    if not waitTime or waitTime == 0 then
        enable = false
    elseif waitTime < 0 then
        signTxt = "r"
        waitTime = -waitTime
    else
        signTxt = "+"
    end

    -- 自动切换逻辑
    while true do
        if enable then
            os.sleep(waitTime)
            loadImage(signTxt)
        else
            -- 监控不存在事件无限期挂起
            os.pullEvent("Tendou Aris")
        end
    end
end

-- 网络监听任务
local function netTask()
    if config.useNet then
        local net = require("net")
        net.listen("picctl", function(data, id)
            local packID = inProcessing and "RST" or "ACK"
            if data == "next" then
                -- 下一个
                loadImage("+")
                net.sendData(id, packID, "picctl")
            elseif data == "last" then
                -- 上一个
                loadImage("-")
                net.sendData(id, packID, "picctl")
            elseif data == "random" then
                -- 随机
                loadImage("r")
                net.sendData(id, packID, "picctl")
            elseif string.sub(data, 1, 4) == "set-" then
                -- 设置指定索引图片
                local num = tonumber(string.sub(data, 4, #data))
                if num == nil or num < 1 or num > #fileList then
                    net.sendData(id, "NCK", "picctl")
                end
                config.lastIndex = num
                loadImage()
                net.sendData(id, packID, "picctl")
            elseif data == "getCID" then
                -- 返回计算机ID
                net.sendData(id, "ID", "picctl")
            elseif data == "reload" then
                -- 重置
                cleanup()
                net.sendData(id, packID, "picctl")
                os.sleep(1)
                os.reboot()
            end
        end)
    else
        while true do
            -- 监控不存在事件无限期挂起
            os.pullEvent("Sumi Serina")
        end
    end
end

-- UI 任务
local function uiTask()
    while true do
        local _, side, x = os.pullEvent("monitor_touch")
        print("aaaa")

        if side == config.ctrlSide then
            if x <= unitW then
                loadImage("-") -- 上一个
            elseif x > unitW * 2 then
                loadImage("+") -- 下一个
            else
                -- 停止脚本
                cleanup()
                break
            end
        end
    end
end

-- 强制重启监测
local function redstoreTask()
    while true do
        os.pullEvent("redstone")
        if redstone.getInput(config.resetSide) then
            cleanup()
            os.sleep(1)
            os.reboot()
        end
    end
end

-- 初始化显示
if isDebug then os.sleep(2) end
loadImage()

-- 启动任务
parallel.waitForAny(uiTask, redstoreTask, netTask, autoSwitch, refreshImg)

-- 停止界面
mon.setTextScale(1)
mon.setCursorPos(1, 1)
mon.write("The system has stopped!")
mon.setCursorPos(1, 2)
mon.write("Tap screen to prevent restart!")
parallel.waitForAny(
    function() -- 手动中断
        os.pullEvent("monitor_touch")
    end,
    function() -- 超时重启
        local time = 10
        repeat
            mon.setCursorPos(1, 3)
            mon.setTextColor(colors.yellow)
            mon.write("Restarting in " .. time .. "s ... ")
            mon.setTextColor(colors.white)
            time = time - 1
            os.sleep(1)
        until time <= 0
        os.reboot()
    end
)

-- 手动中断
mon.setCursorPos(1, 3)
mon.setTextColor(colors.lightBlue)
mon.write("X Restarting task aborted!")
mon.setTextColor(colors.white)
