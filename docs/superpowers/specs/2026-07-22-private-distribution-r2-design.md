# 私有分发（GitHub + Cloudflare R2）与一键更新 — 设计规格

**Date:** 2026-07-22  
**Status:** Approved — 实施计划见 `docs/superpowers/plans/2026-07-22-private-distribution-r2.md`  
**Version context:** prism-next **v0.5.14**；已有 `electron-builder.yml`（mac DMG / win NSIS / linux AppImage）与轻量 `update-checker.ts`  
**Audience:** 产品 / 架构 / 后续实现会话  

**Related code homes（现状）：**

- 打包：`electron-builder.yml` · `package.json` scripts  
- 更新检查：`src/main/services/update-checker.ts` · `src/main/ipc/update.ts` · About 设置 UI  
- 无现成 `.github/workflows/` 发布流水线；无 `electron-updater` 依赖  

---

## 0. 一句话定位

> **私有 GitHub 仓做代码与 CI；Cloudflare R2 做安装包与更新源；同仓 `website/` 做极简下载页；应用内用 `electron-updater`（generic → R2）实现一键更新。**  
> 不是公开开源 Release 分发，也不是国内备案/应用商店上架方案。

---

## 1. 背景与目标

### 1.1 动机

- 需要小范围外发桌面客户端，代码保持私有。  
- 熟悉 GitHub，接受私有仓 + Actions。  
- 需要应用内一键更新，而非仅「打开浏览器下新包」。  
- 下载页与 Electron 应用边界清晰，但阶段上不拆独立 website 仓库。

### 1.2 成功标准

1. 打 tag（或手动触发 workflow）可产出 macOS / Windows 安装包并上传 R2。  
2. 未安装用户可通过 `website/`（Cloudflare Pages）下载最新包。  
3. 已安装用户可在应用内检查更新 → 下载 → 安装重启（一键更新）。  
4. 仓库保持 private；安装包不必挂在公开 GitHub Release。  
5. 国内 ICP 备案不在本阶段范围（站点与对象存储均走 Cloudflare 海外）。

### 1.3 非目标（本阶段明确不做）

- 独立 website 仓库（方案 B）  
- 国内 OSS / ICP 备案 / 公安备案  
- Mac App Store / Microsoft Store / 国内安卓应用商店  
- 账号系统、邀请码平台、付费收银台  
- Linux 作为首发必选平台（可保留 builder 配置，CI 可后补）  
- 把 Prism 做成 Web 版应用  

---

## 2. 架构总览

```text
开发者
  │ push / tag (private GitHub)
  ▼
GitHub Actions
  │ electron-builder → .dmg / .exe (+ latest*.yml)
  ▼
Cloudflare R2  (releases artifacts + update manifests)
  │
  ├─► electron-updater (generic provider)  ← 已安装用户一键更新
  │
  └─► website/ on Cloudflare Pages         ← 未安装用户首次下载
```

| 组件 | 职责 | 托管 |
|------|------|------|
| 私有 GitHub 仓 | 源码、CI、Secrets | GitHub |
| R2 bucket | 安装包 + `latest.yml` / `latest-mac.yml` 等 | Cloudflare |
| `website/` | 产品一句话 + 下载按钮 + 版本号 | Cloudflare Pages（Root = `website/`） |
| Electron 主进程 | `electron-updater` + 现有 About/IPC UI 演进 | 应用内 |

---

## 3. 仓库布局（方案 A）

全部位于 **同一私有仓** `prism-next`：

```text
prism-next/
├── src/                      # Electron 应用（现有）
├── website/                  # 新建：极简静态下载站
│   ├── index.html（或框架入口）
│   └── …                     # 仅下载/介绍所需资源
├── electron-builder.yml      # 扩展 publish → generic → R2 公共读 URL
├── .github/workflows/
│   └── release.yml           # tag / workflow_dispatch → build → upload R2
└── docs/superpowers/specs/   # 本文
```

**约定：**

- Cloudflare Pages 只构建/部署 `website/`，不打包 Electron。  
- R2 对象键建议：`releases/${version}/…`，并在桶根或约定前缀维护「latest」清单（electron-builder `publish` 惯例）。  
- 下载页链接指向 R2（或绑定在 R2 上的自定义域），不指向 GitHub Release Assets。

---

## 4. R2 与访问模型

### 4.1 Bucket

- 使用 **Standard** 存储（享受免费额度：10 GB / 月量级读写；egress 免费）。  
- 小范围外发预期长期落在免费额度内。

### 4.2 读权限策略（二选一，实现计划里定一种）

| 策略 | 说明 | 适用 |
|------|------|------|
| **P1. 公开读 bucket / 自定义域（推荐起步）** | 知道 URL 即可下载；靠「不公开宣传」做小范围控制 | 试用外发、实现简单 |
| P2. 签名 URL / Worker 鉴权 | 链接有过期或需 token | 以后要加强管控时再上 |

本阶段默认 **P1**：更新源 URL 固定，利于 `electron-updater`；安全模型是「链接不扩散」而非强 ACL。

### 4.3 与备案

- Pages + R2 均在海外时，**不要求 ICP 备案**。  
- 代价：部分国内网络访问可能偏慢；正式做国内主渠道时再评估境内镜像（另开设计）。

---

## 5. CI / 发布流水线

### 5.1 触发

- `push` tags：`v*`（主路径）  
- `workflow_dispatch`：手动试发  

### 5.2 任务（逻辑）

1. Checkout；安装依赖（pnpm）；准备各平台 OpenCode binary（与现有 `electron-builder.yml` `extraResources` 一致）。  
2. `electron-vite build` + `electron-builder`（mac / win matrix；linux optional）。  
3. 将产物与 `latest*.yml` 上传 R2（AWS-compatible API + Cloudflare 凭证）。  
4. （可选）提交或生成 `website` 展示用的 `version` 元数据（可用构建时注入或读 `package.json`）。

### 5.3 Secrets（GitHub Actions）

至少：

- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`  
- （建议）`CSC_LINK` / `CSC_KEY_PASSWORD` 等 Windows 签名  
- （建议）Apple 公证相关：`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 或 API key  

无签名时流水线仍可出包，但自动更新/ Gatekeeper 体验降级（见 §6.3）。

---

## 6. 一键更新（electron-updater）

### 6.1 方向

- 引入 `electron-updater`，`provider: "generic"`，`url` 指向 R2 更新根（与 builder `publish` 一致）。  
- 清单字段与现有 `update-checker` 的 `VersionInfo`（`version` / `path` / `releaseNotes` / `pubDate`）对齐；**演进现有 IPC/About UI**，避免两套并行长期并存。  
- 目标 UX：检查更新 → 下载进度 → 安装并重启（用户确认后）。

### 6.2 行为策略（产品）

| 项 | v1 建议 |
|----|---------|
| 检查时机 | 启动后延迟检查 + About「检查更新」 |
| 下载 | 用户确认后下载（小范围更稳妥；可后续改为后台静默下载） |
| 忽略版本 | 保留现有「忽略此版本」能力（若 UI 已有） |
| 渠道 | 单一 `latest`；暂不分 beta/stable |

### 6.3 代码签名（硬依赖体验）

| 平台 | 无签名时 | 有签名时 |
|------|----------|----------|
| macOS | Gatekeeper 警告；自动替换更新不可靠 | Developer ID + 公证后 updater 正常 |
| Windows | SmartScreen 警告 | Authenticode 后体验明显更好 |

**分阶段：**

1. **Update-capable：** R2 + generic provider + UI 通路打通（可先下载安装包/打开外链兜底）。  
2. **One-click polish：** 补齐签名与公证后，启用完整 `quitAndInstall` 路径。  

规格要求实现计划写明：证书未就绪时的降级行为，避免「按钮点了没反应」。

### 6.4 与现有 `update-checker.ts` 的关系

- 现状：拉 manifest → 比 semver → 缓存 → UI 引导 `shell:openExternal` 打开下载 URL；**故意**未引入 electron-updater。  
- 目标：主路径改为 updater；若需兼容「仅通知、外链下载」可短暂保留为未签名平台的 fallback，验收通过后删除或收窄。

---

## 7. 下载页（`website/`）

### 7.1 范围（极简）

- 品牌/产品名（一级）  
- 一句定位  
- macOS / Windows 下载 CTA（指向 R2 最新包）  
- 当前版本号（及可选极简 release notes 链接）  

### 7.2 不做

- 登录、文档站、博客、定价页、Web 编辑器  
- 复杂动效与多页面信息架构（后续可加，不阻塞分发）

### 7.3 部署

- Cloudflare Pages ↔ 私有仓，Root Directory = `website/`  
- 可用 `*.pages.dev` 起步；自定义域可选、非本阶段必须  

---

## 8. electron-builder 配置要点

在现有 `electron-builder.yml` 上扩展（实现时落盘）：

- `publish`:
  - `provider: generic`
  - `url: <R2 公共更新根 URL>`
- 保持现有 `artifactName`、各平台 `extraResources`（OpenCode binary）不变。  
- 不把 `publish` 指到公开 GitHub Releases（与「私有分发」目标冲突，除非仅作 CI 内部缓存且 Assets 保持 private——本设计仍以 R2 为唯一对外源）。

---

## 9. 安全与合规（范围说明）

| 主题 | 本阶段结论 |
|------|------------|
| 源码可见性 | 私有 GitHub |
| 安装包可见性 | URL 可知即可下（P1）；非强鉴权 |
| ICP 备案 | 海外托管 → 不做 |
| 隐私/收集 | 下载页若无账号，无额外采集；应用内既有设置不变 |
| 法律免责 | 本文为工程设计，非法律意见 |

---

## 10. 实施分期（供 writing-plans 拆任务）

| Phase | 交付 | 验收 |
|-------|------|------|
| **P0** | Cloudflare R2 + Pages 账号与桶；文档中的 URL/Secrets 清单 | 人工可上传一个测试文件并 HTTPS 访问 |
| **P1** | `website/` 极简页 + Pages 部署 | 打开站点能看到版本与下载按钮（可先手写链接） |
| **P2** | GitHub Actions 打 tag 出包并上传 R2 | tag 后 R2 出现对应版本产物与 `latest*.yml` |
| **P3** | 接入 `electron-updater` + About/IPC 演进 | 安装旧包能检测到 R2 上新版本并完成更新流程（签名按 §6.3） |
| **P4** | （可选）签名/公证打通；去掉外链兜底 | 一键更新在目标平台无多余安全阻断 |

建议默认实现顺序：**P0 → P2 与 P1 可并行 → P3 → P4**。

---

## 11. 决策记录

| ID | 决策 | 结论 |
|----|------|------|
| D1 | 代码托管 | GitHub **Private** |
| D2 | 制品存储 | Cloudflare **R2** |
| D3 | 下载页位置 | 同仓 **`website/`（方案 A）**，不拆独立仓 |
| D4 | 更新机制 | **electron-updater** + generic → R2 |
| D5 | 分发控制 | 小范围；公开读 URL + 不公开宣传（P1） |
| D6 | 备案 | 本阶段不做 |
| D7 | Linux CI | 非首发阻塞；builder 配置可保留 |
| D8 | `docs/` 与未来开源 | **不**把整个 `docs/` 丢进 `.gitignore`（会丢失版本追踪，且与 agent 规格工作流冲突）。维持现状：`docs/audit/`、`docs/internal/` 已 ignore（敏感/内部）；`docs/superpowers/` **继续进 Git**。开源当日再二选一：(a) 发布用 export 脚本排除 `docs/superpowers/`，或 (b) 迁到独立私有文档仓。 |

---

## 12. 开放问题（实现前可默认）

以下已有推荐默认值；若产品无异议，实施计划直接采用：

1. **首发平台：** macOS + Windows（Linux 后补）。  
2. **R2 访问：** P1 公开读。  
3. **域名：** 先 `pages.dev` + R2 默认/自定义子域，再绑品牌域。  
4. **签名：** P3 可先降级，P4 补齐；不阻塞流水线出包。  

---

## 13. 下一步

1. 产品确认本文无歧义修改。  
2. 使用 writing-plans 产出可执行实施计划（按 §10 Phase 拆任务与测试点）。  
3. 实现会话按计划落地；changelog 记入下一 Unreleased 版本。
