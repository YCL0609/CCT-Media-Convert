---@diagnostic disable: undefined-field, undefined-global
local net = require("net")
local inProcessing = false
local ACKTimeout = 3
local serverId = -1
local ACK = false

term.setTextColor(colors.cyan)
print("Use 'A' for the last. \nUse 'D' for the next.\nUse 'W' for random.\nUse 'S' to reload.\n")
term.setTextColor(colors.white)

-- ACK处理
local function waitACK()
    local time = ACKTimeout
    repeat
        if ACK then return true end
        time = time - 1
        os.sleep(1)
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
    if serverId < 0 and data == "getID" then
        net.broadcast(data, "picctl")
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
        elseif data == "ID" then
            serverId = id
            ACK = true
        end
    end)
end

-- 控制函数
local function control()
    print("Detecting remote host...")
    doSend("getID", 0)
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
