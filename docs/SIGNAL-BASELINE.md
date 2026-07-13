# Automiora Signal Baseline

> 建立日期：2026-07-14  
> 站点：`https://automiora.com`  
> Thesis：`video-creation` / `ai-video-workflow-short-form-demo`  
> 分支：`codex/automiora-signal-first-pass`  
> 用途：Signal First Pass 的**对照基线**。后续任何内容/CTA/SEO 改动都应用同口径复测。

## 1. 锁定 URL

| Path | 角色 | Live HTTP (2026-07-14) | Canonical (live) | meta robots (live) |
|------|------|------------------------|------------------|--------------------|
| `/` | 首页 | 200 | `https://automiora.com/` | 默认（无 noindex） |
| `/workflow/` | 工作流 | 200 | `https://automiora.com/workflow/` | 默认 |
| `/compare/` | 对比 | 200 | `https://automiora.com/compare/` | 默认 |
| `/prompt-pack/` | 主资产 | 200 | `https://automiora.com/prompt-pack/` | 默认 |
| `/audit/` | 咨询 offer | 200 | `https://automiora.com/audit/` | 默认 |

补充检查：

| 资源 | HTTP | 备注 |
|------|------|------|
| `/robots.txt` | 200 | `Allow: /`；`Disallow: /ops/`、`/generated-sites/`；指向 sitemap |
| `/sitemap.xml` | 200 | 见 §3 |

**GSC URL Inspection：** 本 baseline 记录了 live HTTP + 本地 robots/sitemap 对照。完整 URL Inspection（indexed / crawled / referring sitemap）需在 GSC UI 或带有效 OAuth 的 API 再补一轮；自动化 memory 显示 2026-06-01 起 OAuth 曾失效。

## 2. 流量与会话快照（有版本差）

| 来源 | 时间 | impressions | clicks | CTR | avg position | sessions | conversions | revenue |
|------|------|-------------|--------|-----|--------------|----------|-------------|---------|
| `public/generated/live-monitoring-refresh.json` | 2026-07-09 | 9 | 0 | 0 | 5 | 19 | 0 | 0 |
| `automations/automiora-change-alert/memory.md` | 2026-06-01 | 11 | 0 | — | 3.9 | 45 | — | — |

共同结论：

- **几乎没有真实搜索点击**（clicks = 0）
- sessions 更可能含自测/直接访问，不能当 SEO 成功
- ranking query count / top50 = 0（GSC 无 public-page query rows）

## 3. Sitemap / robots 对照

### 3.1 robots（`public/robots.txt`）

```
User-agent: *
Allow: /
Disallow: /ops/
Disallow: /generated-sites/
Sitemap: https://automiora.com/sitemap.xml
```

解释：

- 生产根路径可被抓
- `generated-sites` 调试面被 disallow —— **符合预期，不是主修复项**

### 3.2 sitemap 收录（本地 `public/sitemap.xml`，lastmod 2026-07-11）

收录：

- `/`、`/compare/`、`/workflow/`
- `/faq/`、`/best-tools/`、`/pricing/`、`/free-vs-paid/`
- `/use-cases/`、`/templates/`、`/case-study/`
- `/guides/ai-video-diy-vs-freelancer/`
- `/cost/ai-video-production-cost/`
- `/hire/ai-video-editor/`

**未进 sitemap（但 live 200）：**

- `/prompt-pack/`
- `/audit/`
- `/comparison-worksheet/`
- `/workflow-checklist/`

判断：

- 内容决策页在 sitemap 内是合理 SEO 结构
- 转化资产页是否进 sitemap 可策略选择（有时故意不让资产页抢权重）
- Baseline 记录事实：五核心 URL 中 **资产与 audit 不在 sitemap**

## 4. CTA mapping 基线（生产 HTML）

分类规则：

- **ASSET/OFFER**：`/prompt-pack*`、`/comparison-worksheet*`、`/workflow-checklist*`、`/audit*`
- **CONTENT**：其它站内内容页
- **EXTERNAL**：站外

| 页面 | 主 CTA | 次 CTA | 状态 |
|------|--------|--------|------|
| `/` | `/prompt-pack/` | `/audit/` | 主路径 OK |
| `/` selector 结果占位 | `href="/"`（JS 填充前） | reset button | **占位指向泛内容面** |
| `/workflow/` | `/comparison-worksheet/` | `/audit/` | OK |
| `/compare/` | `/workflow-checklist/` | `/audit/` | OK |
| `/pricing/` | `/prompt-pack/` | `/audit/` | OK |
| `/free-vs-paid/` | `/prompt-pack/` | （无 secondary cta-button） | 主路径 OK |
| `/prompt-pack/` | form → `/prompt-pack/ready/` | — | OK（表单交付） |
| `/audit/` | form → `/audit/ready/` | — | OK（表单交付） |
| `/templates/` | `/prompt-pack/` | `/audit/` | OK |
| `/faq/`、`/best-tools/`、`/use-cases/`、`/case-study/` | `/prompt-pack/` | 部分有 audit | OK |

### 4.1 Phase 1 acceptance 归因

`public/generated/phase1-validation.json`：

```text
fail — Every strong page routes to an asset landing page
detail — Some page CTAs still route to generic content surfaces.
```

代码（`scripts/run-pipeline.mjs`）旧逻辑：

```js
page.ctaHref.includes('/generated-sites/')
```

问题：

- 生产 CTA 已是 `/prompt-pack/` 等根路径
- 验收仍要求 demo 面路径 → **假失败**
- 真正的边缘问题是 selector 占位 `href="/"` 等，应单独修

**Signal First Pass 修正目标：** acceptance 认生产资产/offer 路径；selector 占位默认落到资产而非 `/`。

## 5. 转化与 lead 基线

来源：`storage/commercial-ops.json`（generatedAt 2026-05-04）+ asset-performance 注记。

| 指标 | 值 |
|------|----|
| asset leads | 11 |
| delivered | 11 |
| resent | 0 |
| open followups | 4 |
| overdue followups | 0 |
| qualified | **0** |
| won | **0** |
| revenueUsd | **0** |
| consult requests | 0 |
| 主资产 | prompt-pack |
| strongest source page (ops) | 仍记 `/generated-sites/.../asset-prompt-pack.html`（历史路径） |

口径修正：

- 后端**已有** follow-up / qualified / won 与 commercial ops 汇总
- 缺口是 **结果为零**，不是“字段不存在”

## 6. 生产面 vs 调试面

| 面 | 路径 | 角色 |
|----|------|------|
| 生产 | `public/index.html`、`public/workflow/`… | 线上主路径 |
| 调试/镜像 | `public/generated-sites/ai-video-workflow-short-form-demo/*` | 常含 noindex；robots disallow |
| 运营 | `/ops/` | robots disallow |

**主任务不在修 generated-sites noindex。**

## 7. 待补测清单（下一轮可勾）

- [ ] GSC URL Inspection：5 个 URL 的 index status / last crawl / referring sitemap
- [ ] 恢复 Google OAuth 后重跑 `pnpm run monitoring:refresh:live`
- [ ] GA4：按 path 拆 sessions / asset_cta_click / asset_form_submit / asset_delivery
- [ ] 分发前后各记一次 clicks / asset actions
- [ ] CTA acceptance 修正后重生成 `phase1-validation.json`

## 8. 基线结论（一句话）

> 五个生产 URL 都活着且默认可索引；搜索几乎无点击；CTA 主路径大多已接资产/audit，但 Phase 1 验收仍用过期 `/generated-sites/` 规则制造假失败；lead 有交付与 follow-up 字段，尚无 qualified/won/revenue。  
> 下一步：修验收与占位 CTA → 内容竞争力 pass → 小分发 → 只看真实信号。
