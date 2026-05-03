# Trend Site Pipeline 系统说明

这份文档讲系统结构，不讲按钮点击。

## 1. 全链路

系统围绕这条链路工作：

`热词发现 -> 验证筛选 -> 关键词聚类 -> 内容生成 -> 页面构建 -> 质量审核 -> 部署上线 -> SEO提交 -> 数据监控 -> 排名/转化优化 -> 淘汰/扩展`

现在中间多了一层显式路由：

`热词 -> thesis -> 域名`

## 2. 核心入口

- 主脚本：
  - [`scripts/run-pipeline.mjs`](/Users/max/code/trend-site-mvp/scripts/run-pipeline.mjs)
- thesis 晋升脚本：
  - [`scripts/thesis-promote.mjs`](/Users/max/code/trend-site-mvp/scripts/thesis-promote.mjs)
- 前端控制台：
  - [`src/App.tsx`](/Users/max/code/trend-site-mvp/src/App.tsx)

## 3. thesis 路由层

每个热词会和 `thesis-registry` 里的 thesis 做匹配。

可能结果：

- `append_existing`
- `create_candidate`
- `reject_or_watch`

匹配维度：

- user overlap
- intent overlap
- monetization overlap
- support reuse
- content asset reuse
- brand boundary

现在主词选择不只看 `overallScore`，还会叠加 `sourceReadinessScore`。

也就是说：

- 不是最会“涨”的词就一定当 cluster 主词
- 更优先选“能搜到真实证据、能支撑 source-pack”的词

另外现在区分两种 thesis 行为：

- `active thesis`
  - 默认 `primaryKeywordStrategy = pinned`
  - 会锁定 `pinnedPrimaryKeyword`
  - 只在 `keywordBoundary` 内吸收新机会
  - 新机会可以扩成支持页，但不会自动把站点主词换掉
- `candidate thesis`
  - 默认 `primaryKeywordStrategy = dynamic`
  - 允许继续漂移和聚焦，等验证清楚后再晋升

## 4. 内容生成层

内容层现在是六段式：

1. `source-pack`
2. `research-dossier`
3. `claim cards`
4. `page briefs`
5. `page models / fact cards`
6. `HTML render`

### source-pack

最低层级：

- `official`
- `competitive`
- `community`
- `workflow`
- `serp`

数据会落到：

- `public/generated/content-artifacts/<site-slug>/source-pack.json`

### facts / page models

每一页都会落 page-level JSON：

- `public/generated/content-artifacts/<site-slug>/facts/*.json`

这些 page facts 里包含：

- intro
- sections
- verdicts
- keyFacts
- examples
- materialSlots
- commercialModules
- sourceReferences
- claimIds
- pageBrief
- researchDossier

### Hermes LLM Wiki

现在有一套 canonical content asset store：

- `wiki/01-theses/`
- `wiki/02-clusters/`
- `wiki/03-sources/`
- `wiki/04-claims/`
- `wiki/05-page-briefs/`
- `wiki/06-assets/`
- `wiki/07-reviews/`
- `wiki/08-experiments/`

对外可读索引：

- `public/generated/wiki-index.json`

运行时原则：

- `wiki/*` 存主资产
- `public/generated/*` 和 `storage/*` 存派生产物与快照
- 页面生成优先复用 `claim`、`page brief`、`conversion asset`
- 可选 `Firecrawl CLI` 负责把网页证据先压成更结构化的 `source-pack` / `deep research` / `research-dossier` 原料
- 当前 pipeline 读取 Wiki 的边界：
  - `wiki/04-claims/*`
  - `wiki/05-page-briefs/*`
  - `wiki/06-assets/*`
- 当前 pipeline 写回 Wiki 的边界：
  - `thesis`
  - `cluster`
  - `source`
  - `claim`
  - `page_brief`
  - `conversion_asset`
  - `review`
  - `experiment`
- 当前 pipeline 不写回 Wiki：
  - 整页 HTML
  - 构建日志
  - 无结构临时文本
- 如果手工编辑的 Wiki 卡与本轮生成对象 `id` 相同，则以 Wiki 卡为准。

## 5. 页面模板

标准 cluster 现在是 10 页：

- `hub`
- `alternatives`
- `workflow`
- `faq`
- `best-tools`
- `pricing`
- `free-vs-paid`
- `use-cases`
- `template-kit`
- `case-study`

每页都可以绑定：

- conversion asset
- CTA
- commercial module
- source refs
- material slots

## 6. Gate 1 / Gate 2 / Gate 3

### Gate 1

看：

- 趋势连续性
- 商业意图
- 支持页广度

### Gate 2

现在已经是 `结构 + 证据 + 可用性` 审核：

- facts
- verdicts
- examples
- source traceability
- signal-rich sources
- specificity score
- repeated sentence check
- low-signal source check
- original anchors
- intent completeness
- AI fluff ratio

没过 Gate 2 的页面会自动写入 `noindex`。

### Firecrawl 接入点

当前最对路的接法是：

- `fetchSearchResults`
  - Firecrawl `search` 优先
- `buildSourcePack`
  - Firecrawl `scrape` 补重点 URL 的结构化证据
- `deepResearch`
  - Firecrawl `map` 发现 pricing / docs / changelog / template 等更深页面
- `research-dossier`
  - 可选 Firecrawl `agent + schema` 输出更结构化的 dossier 候选

现在 deep research 还会额外偏向：

- first-party / product-owned surfaces
  - docs
  - help
  - pricing
  - api
  - workflow / prompt guides
- generic editorial / listicle surfaces 会被降权

### Gate 3

优先读：

- GSC 排名数据
- GA4 转化数据

缺配置时才回退 forecast。

### Asset Acceptance Gate

页面通过 Gate 2，不等于资产可以直接交付。

当前系统已经有：

- asset landing page
- thank-you page
- downloadable markdown
- GA4 click / submit / delivery 事件

但在产品规则上，`conversion asset` 现在需要额外经过一层独立判断：

- A 类：自动直发候选
  - checklist / worksheet / shortlist
- B 类：人工快审后放行
  - prompt-pack / template pack / pricing comparison 下载物
- C 类：人工强审
  - consult offer / affiliate / 强 ROI 承诺资产

核心原则不是“零人工”，而是：

`自动生成主干 + 最小人工成本验收 + Wiki 回写复用`

完整规范见：

- [`docs/ASSET-ACCEPTANCE-GATE.md`](/Users/max/code/trend-site-mvp/docs/ASSET-ACCEPTANCE-GATE.md)

## 7. 人工审校入口

系统默认可无人值守，但保留人工覆盖：

- `storage/review-overrides.template.json`
- `storage/review-overrides.json`

下一轮 pipeline 会自动应用这些 override。

这让链路支持：

`AI 初稿 -> 人工改关键块 -> 自动重新发布`

对于 asset，推荐的人工作用不是重写，而是：

- 判断是否可放行
- 标记失败项
- 生成 rewrite instruction
- 在必要时只改最后一小块承诺或示例

## 8. 内容回流

系统已经会写：

- `storage/review-queue.json`
- `storage/content-feedback.json`
- `storage/pipeline-history.json`
- `storage/content-playbook.json`

现在已经能回答：

- 哪些 page type 的 facts / verdicts / refs 更强
- 哪些页面类型更接近转化
- 当前 site 下一步该扩、该优，还是先维持

并且已经会把这些反馈直接回灌进下一轮生成规则：

- page type target
  - facts / verdicts / examples / refs
- site-level strategy
  - title
  - meta
  - CTA
  - support page bias
- manual review pattern
  - 哪些页型反复需要人工看
  - 下一轮自动提高这些页型的具体度

## 9. 关键产物

- `public/generated/pipeline-report.json`
  - 前端主数据源
- `public/generated/review-queue.json`
  - review queue 镜像
- `public/generated/content-feedback.json`
  - feedback 镜像
- `public/generated/content-playbook.json`
  - next-run playbook 镜像
- `public/generated/content-artifacts/index.json`
  - artifact 索引
- `public/generated/wiki-index.json`
  - Hermes Wiki 资产索引

## 10. 当前默认运行形态

今天这套系统最接近的运行方式是：

- 默认无人值守跑
- Gate 2 自动放行高质量页面
- GSC + GA4 提供真实 Gate 3 信号
- 只有关键页面才走 review override
- 资产层按 `Asset Acceptance Gate` 规范逐步补齐自动放行与快审队列
