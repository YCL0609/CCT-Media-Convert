-- SPDX-FileCopyrightText: 2026 YCL <email@ycl.cool>
-- SPDX-License-Identifier: GPL-2.0-or-later

---@diagnostic disable: undefined-field, undefined-global
local net = require("net")
local inProcessing = false
local ACKTimeout = 3
local serverId = -1
local ACK = false
local RST = false

term.setTextColor(colors.cyan)
print("Use 'A' for the last. \nUse 'D' for the next.\nUse 'W' for random.\nUse 'S' to reload.\n")
term.setTextColor(colors.white)

-- ACK处理
local function waitACK()
    local time = ACKTimeout
    repeat
        if ACK then return true end
        time = time - 1
        if RST then
            RST = false
            os.sleep(10)
        else
            os.sleep(1)
        end
    until time <= 0

    term.setTextColor(colors.yellow)
    print("[!] ACK signal timed out!")
    term.setTextColor(colors.white)

    return false
end

-- 重试
local function doSend(data, count)
    ACK = false
    -- 多次错误退出
    if count >= 3 then
        printError("\nRetry attempts exhausted, remote host offline, program exiting!")
        error()
    end

    -- 发送信息
    if serverId < 0 and data == "getCID" then
        net.broadcast("getCID", "picctl")
    else
        net.sendData(serverId, data, "picctl")
    end
    os.sleep(0.1) -- 轻微延迟等待数据送达

    -- 等待ACK
    if not waitACK() then
        doSend(data, count + 1)
    end
end

-- 网络函数
local function network()
    net.listen("picctl", function(data, id)
        if data == "ACK" then
            ACK = true
        elseif data == "NCK" then
            ACK = true
            term.setTextColor(colors.yellow)
            print("[!] NCK signal received!")
            print("[I] The server indicates that the data is invalid!")
            term.setTextColor(colors.white)
        elseif data == "RST" then
            RST = true
            print("[!] RST signal received!")
            print("[I] Server is busy, try again in 10 seconds.")
        elseif data == "ID" then
            serverId = id
            ACK = true
        end
    end)
end

-- 控制函数
local function control()
    print("Detecting remote host...")
    doSend("getCID", 0)
    print("Remote host ID: " .. serverId .. "\n")
    while true do
        local _, key = os.pullEvent("key")
        if not inProcessing and serverId >= 0 then
            inProcessing = true
            if key == keys.d then -- 下一个
                print("Send signal: next   -->")
                doSend("next", 0)
            elseif key == keys.a then -- 上一个
                print("Send signal: last   <--")
                doSend("last", 0)
            elseif key == keys.w then -- 随机
                print("Send signal: random -*-")
                doSend("random", 0)
            elseif key == keys.s then -- 重置
                print("Send signal: reload -R-")
                doSend("reload", 0)
            end
            inProcessing = false
        end
    end
end

parallel.waitForAny(network, control)
