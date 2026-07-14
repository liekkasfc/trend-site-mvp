# Automiora Signal First Pass

> 分支：`codex/automiora-signal-first-pass`  
> 起点：`codex/root-thesis-ops-release`  
> 目标：用**最小工程改动**验证 `automiora.com` 能否产生真实搜索/分发信号，而不是继续扩 thesis 或拆大单体。

## 1. 为什么现在做这个

项目已是 **强 MVP / 弱生意**：

- 全链路能跑（生成 → 发布 → SEO → 监控 → lead 交付）
- 真实搜索流量接近零（不同快照约 `9–11` impressions / `0` clicks）
- 商业结果：`0 qualified / 0 won / $0 revenue`（字段已有，结果没有）

当前主矛盾不是“系统缺节点”，而是 **生产 URL 是否有信号、CTA 是否接对、内容是否值得点**。

## 2. 锁定范围（不扩站）

### 2.1 五个生产 URL（监控与验收核心）

| # | URL | 角色 |
|---|-----|------|
| 1 | `https://automiora.com/` | 首页 / 决策入口 |
| 2 | `https://automiora.com/workflow/` | 工作流决策页 |
| 3 | `https://automiora.com/compare/` | 替代/对比页 |
| 4 | `https://automiora.com/prompt-pack/` | 主转化资产 |
| 5 | `https://automiora.com/audit/` | 高意图咨询 offer |

### 2.2 内容竞争力 pass 页（可含非监控页）

| 页 | 目标资产 / 次 CTA |
|----|-------------------|
| `/workflow/` | comparison worksheet → audit |
| `/compare/` | workflow checklist → audit |
| `/pricing/` | prompt pack → audit |
| `/free-vs-paid/` | prompt pack → audit |
| `/prompt-pack/` | form → delivery |

### 2.3 明确不做

- 第二个 thesis / 新域名
- 大规模拆 `run-pipeline.mjs`
- 以 `generated-sites/*` 的 `noindex` 为主任务（那是调试/镜像面）
- 全局默认 `CONTENT_AI_PROVIDER=llm` 一刀切

## 3. 工作包

### WP0 — Baseline（本轮文档）

见 [SIGNAL-BASELINE.md](./SIGNAL-BASELINE.md)。

- 5 个 URL 的 HTTP / canonical / robots / sitemap 归属
- GSC / GA4 快照（含版本差）
- CTA / delivery / lead 基线
- Phase 1 失败项归因

### WP1 — CTA mapping 修正

**验收标准（更新）：**

强页主 CTA 必须指向 **生产资产路由** 或 **audit**，而不是泛内容面：

- 合法：`/prompt-pack/`、`/comparison-worksheet/`、`/workflow-checklist/`、`/audit/` 及其 ready/thank-you
- 非法：`/faq/`、`/best-tools/`、`/`（除首页自身导航外的“伪装主 CTA”）、其它纯内容页
- **不再要求** CTA 含 `/generated-sites/`（那是过期验收逻辑）

任务：

1. 修正 Phase 1 acceptance：`allPageCtasRouteToAssets` 认生产资产路径
2. 清点生产 HTML 的 `cta-button` / `secondary-cta`
3. 修 selector 等 fallback 仍指向 `/` 的占位 CTA
4. 补最小测试：public CTA path classification

### WP2 — 内容竞争力 pass（5 页）

每页硬指标：

1. **命名工具 / 对象**（不是 “this tool”）
2. **具体数字**（价格区间、时长、步数、失败率或可核对成本）
3. **失败模式**（至少 2 个 why + fix）
4. **推荐逻辑**（if / then，谁不该用）
5. **资产承诺**（下载后 3 分钟能干什么）

优先顺序：`workflow` → `compare` → `pricing` → `free-vs-paid` → `prompt-pack` landing copy。

生成策略：**定点**「证据刷新 + LLM 改写 + Gate 严审」，不是全站 heuristic→LLM。

#### WP2 状态（2026-07-14）

已在生产 HTML 完成第一轮人工 content pass（marker: `data-content-pass="2026-07-14"`）：

| 页 | 主要改动 |
|----|----------|
| `/workflow/` | 5-step 叙事、修 garbled watch-out、if/then 块、Runway/Pika 默认栈、资产 CTA 承诺 |
| `/compare/` | 10 分钟 shortlist、4 工具角色、switch rules、Checklist 承诺 |
| `/pricing/` | $20 地板 + 30–90 min review、去重复 verdicts、成本 if/then |
| `/free-vs-paid/` | 升级边界、清掉 community dump、补 secondary audit CTA |
| `/prompt-pack/` | 30 分钟时间盒、who/not-for、Runway/Pika 绑定 |

后续若跑 pipeline 全量 regenerate，需把同等约束写回 page brief / claim，避免覆盖。

### WP3 — 小分发（不扩站）

| 动作 | 数量 | 目的 |
|------|------|------|
| X 帖 | 1 | 验证链接是否被点 |
| Reddit 或 IndieHackers | 1 | 验证叙事是否成立 |
| 定向 outreach | 5–10 | 验证资产是否被索取 |

只看：真实点击、资产 landing 到达、form submit、delivery。  
不看：forecast revenue、modeled rates。

### WP4 — 邻近测试（仅本轮）

- public route indexability（生产面 `index`/`follow`，`generated-sites` 可 noindex）
- CTA mapping 分类器
- Gate 2 / page model 关键路径（够用即可，不全量重构）

## 4. 成功定义

| 级别 | 条件 |
|------|------|
| **Pass (engineering)** | Phase 1 CTA acceptance 与生产路由一致；5 URL 全部 200 + indexable 语义正确；baseline 文档可复盘 |
| **Pass (signal)** | 任一生产页出现非自测点击，或分发带来可归因 asset 动作 |
| **Pass (commercial weak)** | ≥1 真实 lead 进入 follow-up 队列且有人工状态更新（qualified 可为 0） |
| **Fail / stop-the-line** | 2 周后仍 0 点击且内容 pass 未完成 → 复盘关键词/选题，而不是继续堆自动化 |

## 5. 执行顺序

```
baseline 文档
  → CTA acceptance + 生产 HTML mapping
  → 5 页内容 pass（可分 PR）
  → 小分发
  → 读真数据，决定是否继续 polish / 是否停
```

## 6. 相关文件

- 评估修订：[PROJECT-EVALUATION-2026-07-14.md](./PROJECT-EVALUATION-2026-07-14.md)
- Baseline：[SIGNAL-BASELINE.md](./SIGNAL-BASELINE.md)
- Phase 1 产物：`public/generated/phase1-validation.json`
- 监控：`public/generated/live-monitoring-refresh.json`
- 商业：`storage/commercial-ops.json`
- 生产页：`public/index.html`、`public/workflow/`、`public/compare/`、`public/prompt-pack/`、`public/audit/`
