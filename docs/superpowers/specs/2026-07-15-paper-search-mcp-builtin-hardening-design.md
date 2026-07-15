# Paper Search MCP — 内置硬化设计

**Date:** 2026-07-15  
**Status:** Approved — implement（修订：不做安装包内嵌）  
**Related:** `2026-07-11-paper-search-mcp-integration-design.md`

## 目标

在仍使用上游 [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs) 的前提下，让 Paper Search 更像真正的内置能力：

1. **体验内置**：Settings Built-in / 默认启用 / 不可关删（已做）。
2. **Session 热重载**：Settings 改 env / Apply 后，对当前项目已打开的 ACP session 执行 `session/load` 刷新 MCP。
3. **Allowlist 豁免**：会话级 `mcpServerAllowlist` 非空时，始终并入 `paper-search-mcp`。

## 明确非目标

- **不做** Electron 安装包内嵌 `paper-search-mcp-nodejs`  
- **不做** 本地 vendored 目录 + `node dist/server.js` 拉起  
- 启动方式保持：`npx -y paper-search-mcp-nodejs`  
- 不重写为 Prism native search HTTP 客户端  

## 架构要点

```
mcp.json command = ["npx", "-y", "paper-search-mcp-nodejs"]
Settings Apply → prewarmProject + reloadSessionMcps(all project sessions)
createSession allowlist → ∪ paper-search-mcp
```

## 验收

- Configure 保存后点 Apply（或自动 Apply）：当前 chat 下一轮工具带新 env，无需新 tab  
- composer 只 pin 其他 MCP 时，paper-search 仍进入 session  
- 无 `resources/mcp/` vendor、无 `vendor:paper-search-mcp` 脚本  
