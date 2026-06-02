-- SPDX-License-Identifier: GPL-2.0-or-later
-- Copyright (C) 2026 YCL

local current_path = shell.getRunningProgram()
local script_dir = fs.getDir(current_path)
local self_name = fs.getName(current_path)
local config_file = fs.combine(script_dir, "config.json")

local function loadConfig()
    if not fs.exists(config_file) then return nil, "config.json not found." end

    local file, err = fs.open(config_file, "r")
    if not file then return nil, "Failed to open config: " .. tostring(err) end

    local content = file.readAll()
    file.close()

    local data = textutils.unserializeJSON(content)
    if not data then return nil, "Failed to parse JSON." end

    return data
end

local monitor_map, err = loadConfig()
if not monitor_map then
    printError("Error: " .. err)
    return
end

_G.picMonMap = monitor_map

local tasks = {}
local files = fs.list(script_dir)

for _, file in ipairs(files) do
    if file:match("%.lua$") and file ~= self_name then
        local full_path = fs.combine(script_dir, file)
        table.insert(tasks, function()
            local ok, errno = pcall(shell.run, "/" .. full_path)
            if not ok then
                printError("Error in [" .. file .. "]: " .. tostring(errno))
            end
        end)
    end
end

if #tasks > 0 then
    pcall(parallel.waitForAll, table.unpack(tasks))
    _G.picMonMap = nil
    print("Press Enter to continue...")
    read()

    for _, row in ipairs(monitor_map) do
        for _, id in ipairs(row) do
            local mon = peripheral.wrap(id)
            if mon then
                for i = 0, 15 do
                    mon.setPaletteColor(2 ^ i, 0, 0, 0)
                end
                mon.setBackgroundColor(colors.black)
                mon.setTextColor(colors.white)
                mon.clear()
                mon.setCursorPos(1, 1)
            end
        end
    end
    print("Monitors reset.")
else
    _G.picMonMap = nil
    print("No sub-scripts found to run.")
end
