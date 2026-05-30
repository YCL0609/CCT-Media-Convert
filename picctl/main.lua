---@diagnostic disable: undefined-field, undefined-global
local currentDir = "/" .. fs.getDir(shell.getRunningProgram())
local json = require("json")
local net = require("net")
local inProcessing = false

-- 配置
local ctrlMonName = "top"
local rsSideName = "left"
local randomWateTime = 120
local refreshWateTime = 10

-- 读取图片列表和当前索引
local images = json.load(fs.combine(currentDir, "list.json")) or {}
local currentIndex = settings.get("picSwitch.index") or 1

-- 读取显示器列表
local monitor_map = {}
if fs.exists(currentDir .. "/config.json") then
    local file = fs.open(currentDir .. "/config.json", "r")
    local content = file.readAll()
    file.close()
    monitor_map = textutils.unserializeJSON(content) or {}
    _G.picMonMap = monitor_map
else
    error("'config.json' not found.")
end

-- 初始化控制 UI
local mon = peripheral.wrap(ctrlMonName)
if not mon then return end
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
        currentIndex = currentIndex + 1
    elseif sign == "-" then
        currentIndex = currentIndex - 1
    elseif sign == "r" and #images > 1 then
        local newID
        repeat
            newID = math.random(1, #images)
        until newID ~= currentIndex
        currentIndex = newID
    end

    -- 越界检查
    if currentIndex < 1 then
        currentIndex = #images
    elseif currentIndex > #images then
        currentIndex = 1
    end

    -- 获取当前图片 ID 的路径
    local id = images[currentIndex]
    if not id or not fs.exists(currentDir .. "images/" .. id) then
        print("Image not found: " .. currentDir .. "images/" .. id)
        currentIndex = 1
        id = images[1]
    end

    -- 保存索引
    settings.set("picSwitch.index", currentIndex)
    settings.save()

    -- 遍历运行图片目录下的所有 .lua 文件
    if id and fs.exists(currentDir .. "/images/" .. id) then
        local tasks = {}
        local files = fs.list(currentDir .. "/images/" .. id)
        for _, file in ipairs(files) do
            if file ~= "init.lua" and file ~= "config.json" then
                table.insert(tasks, function()
                    local ok, err = pcall(shell.run, currentDir .. "/images/" .. id .. "/" .. file)
                    if not ok then
                        print("Error running chunk [" .. file .. "]: " .. tostring(err))
                    end
                end)
            end
        end

        if #tasks > 0 then
            parallel.waitForAll(table.unpack(tasks))
        end
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
    local time = tonumber(refreshWateTime)
    if not time or time == 0 then
        enable = false
    elseif time < 0 then
        time = -time
    end

    while true do
        if enable then
            if not inProcessing then loadImage() end
            os.sleep(time)
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
    local waitTime = tonumber(randomWateTime)

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
    net.listen("picctl", function(data, id)
        if data == "next" then -- 下一个
            loadImage("+")
            net.sendData(id, "ACK", "picctl")
        elseif data == "last" then -- 上一个
            loadImage("-")
            net.sendData(id, "ACK", "picctl")
        elseif data == "random" then -- 随机
            loadImage("r")
            net.sendData(id, "ACK", "picctl")
        elseif data == "getID" then  -- 返回计算机ID
            net.sendData(id, "ID", "picctl")
        elseif data == "reload" then -- 重置
            cleanup()
            net.sendData(id, "ACK", "picctl")
            os.sleep(1)
            os.reboot()
        end
    end)
end

-- UI 任务
local function uiTask()
    while true do
        local _, side, x = os.pullEvent("monitor_touch")

        if side == ctrlMonName then
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
        if redstone.getInput(rsSideName) then
            cleanup()
            os.sleep(1)
            os.reboot()
        end
    end
end

-- 初始化显示
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
