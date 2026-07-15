# paper-search-mcp — Prism 集成设计（Node.js）

**Date:** 2026-07-11（2026-07-15 修订：改用 TypeScript MCP）  
**Status:** Approved — implement (Option B)  
**Related:**

- `⭐️2026-07-04-platform-capabilities-phase0-backlog.md` — §3.1 外部题录发现 P1
- `2026-07-01-chat-citation-staging-design.md` — staging 数据模型与 Agent 纪律

**Upstream:** [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs)（npm `paper-search-mcp-nodejs`，MIT）

---

## 1. 目标

1. 将 **Paper Search（Node）** 作为 Prism 第一个 curated MCP；空 `mcp.json` 时 scaffold。
2. 外部学术发现默认走 MCP `search_papers`（及平台工具）；`websearch` 仅 fallback。
3. 结果仍经 **`literature-stage` → `[n]` →（用户要求）`literature-add`**。
4. **不**使用 Python / uv / 应用内 venv / 新二进制 sidecar。

## 2. 架构

```
MCP paper-search-mcp (npx paper-search-mcp-nodejs)
  → DOI / arXiv
  → literature-stage → [n] → library（用户确认后）
```

## 3. 配置

| 项 | 值 |
|----|-----|
| mcpServers key / preset id | `paper-search-mcp` |
| command | `["npx", "-y", "paper-search-mcp-nodejs"]` |
| 可选 env | `SEMANTIC_SCHOLAR_API_KEY`, `PUBMED_API_KEY`, `WOS_API_KEY`（均非必需） |
| discoveredFrom | `"paper-search-mcp"` |

Scaffold / migrate（`ensureDefaultMcpServers`）：

- 缺少 `paper-search-mcp` 条目时写入 npx 默认项（可与其它 MCP 并存）。
- 若已有条目但 command 为 Python / uv / uvx / 旧 venv 路径 → **强制迁到** `npx -y paper-search-mcp-nodejs`。
- 删除 Python 包专用 env（`PAPER_SEARCH_MCP_*`）；保留 Node 侧密钥名（如 `SEMANTIC_SCHOLAR_API_KEY`）。

## 4. Agent 纪律

- 主题搜论文：优先 MCP `search_papers`；MCP 结果须再 `literature-stage`，禁止只贴 MCP 元数据。
- `websearch`：MCP 不可用或非学术查询时可用，且仍须 stage。

## 5. 体验内置（配置层）

- Settings 标注 **Built-in / Default**；UI 禁止关闭与删除。
- `ensureDefaultMcpServers`：缺失则写入；legacy 迁 npx；`enabled: false` 强制改回 `true`。
- 启动始终 `npx -y paper-search-mcp-nodejs`（**不做**安装包内嵌）。
- Settings **Apply to chats** → `session/load` 刷新当前项目已开会话 MCP。
- 会话 allowlist 非空时强制并入 `paper-search-mcp`。
- 详见 `2026-07-15-paper-search-mcp-builtin-hardening-design.md`。

## 6. 非目标

- 不重写为 Prism native search tool  
- 不自动 literature-add  
- 不做 Python 隔离 runtime  
- 不做 Electron Resources / vendor 内嵌 MCP 包  
- Provenance 本轮不做  
