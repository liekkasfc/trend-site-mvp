# Trend Site Pipeline

这个项目现在是一条本地可运行的专题站自动化流水线原型：

`热词发现 -> 验证筛选 -> 关键词聚类 -> 内容生成 -> 页面构建 -> 质量审核 -> 部署上线 -> SEO提交 -> 数据监控 -> 排名/转化优化 -> 淘汰/扩展`

在热词和建站之间，系统增加了显式路由层：

`热词 -> thesis -> 域名`

它不会再默认把每个过关热词都新建站点，而是先判断：

- `append_existing`
  - 并入现有 thesis / 现有域名
- `create_candidate`
  - 进入 thesis 候选池，等待晋升
- `reject_or_watch`
  - 观察或淘汰

## 当前状态

当前样板已经具备这些能力：

- `candidate thesis -> active thesis` 一键晋升
- 默认 `unattended` 内容模式
- `source-pack -> facts -> page model -> HTML` 证据驱动生成
- `wiki claim / page brief / asset -> page model` 反向回流已接通
- 可选 `Firecrawl CLI -> source-pack / deep research / dossier` 证据增强层
- 10 页标准 cluster
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
- Gate 2 证据审核
  - concrete facts
  - verdicts
  - examples
  - source traceability
  - specificity / low-signal / repetition checks
- Gate 3 优先读取真实 `GSC + GA4`
- review queue / content feedback / content playbook / review override 模板
- 上一轮反馈会自动沉淀成下一轮 `content-playbook`
- 已定义 `Asset Acceptance Gate` 规范
  - 目标不是零人工，而是最小人工成本下交付可转化资产

当前默认实验：

- active thesis: `AI video workflow`
- candidate thesis: `AI agent infrastructure`
- active domain: `automiora.com`

## 仓库边界

这个仓库现在按“源码层”和“运行产物层”分开维护：

- 长期进版本库：
  - `config/`
  - `scripts/`
  - `src/`
  - `workers/`
  - `docs/`
  - `wiki/`
  - `public/generated-sites/`
- 本地生成、不长期提交：
  - `public/generated/*`
  - `storage/*.json`
  - `storage/*.md`
  - `storage/release-runs/*`
  - `.wrangler/`
  - `dist/`

详细说明见 [docs/REPO-LAYOUT.md](/Users/max/code/trend-site-mvp/docs/REPO-LAYOUT.md)。

## 常用命令

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm run build
pnpm run pipeline
pnpm run thesis:promote -- --candidate agent-infrastructure --domain agents.example.com --site-slug ai-agent-infrastructure --dry-run
pnpm run google:oauth
pnpm run worker:d1:apply
pnpm run worker:d1:migrate
pnpm run worker:r2:sync
pnpm run worker:deploy
pnpm run release:health
pnpm run seo:diagnostics
pnpm run seo:submit
pnpm run commercial:ops
pnpm run validate
pnpm run release:prod
```

发布后只做验收：

```bash
pnpm run release:redirect -- --paths /,/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack
pnpm run release:test-lead -- --site-slug ai-video-workflow-short-form-demo --asset-slug prompt-pack
pnpm run release:deliver -- --lead-id <lead-id> --delivery-token <token> --verify-get
pnpm run release:ga4 -- --site-slug ai-video-workflow-short-form-demo --asset-slug prompt-pack
```

## 关键输出

下面这些输出仍然会在本地生成，但其中 `public/generated/*`、`storage/*` 这类运行快照默认不再长期进版本库。

- `public/generated/pipeline-report.json`
  - 前端控制台主数据源
- `public/generated-sites/*`
  - 生成站点
- `public/generated/content-artifacts/*`
  - source-pack / page facts / artifact index
- `storage/pipeline-history.json`
  - 监控历史
- `storage/decision-log.md`
  - 三关决策表
- `storage/review-queue.json`
  - 需要 spot-check 的页面
- `storage/review-queue.md`
  - Markdown 版 review queue
- `storage/review-overrides.template.json`
  - 人工审校模板
- `storage/review-overrides.json`
  - 可选人工覆盖文件
- `storage/content-feedback.json`
  - 页面类型反馈信号
- `storage/content-playbook.json`
  - 下一轮内容生成规则
- `public/generated/source-refresh-queue.json`
  - 需要重新补抓证据的来源队列
- `public/generated/seo-submission-state.json`
  - SEO 提交状态
- `storage/commercial-ops.json`
  - 商业承接后端的聚合视图

## 环境变量

见 [`.env.example`](/Users/max/code/trend-site-mvp/.env.example)。

高频变量分三组：

### 站点与运行模式

- `SITE_BASE_URL`
- `MONITORING_MODE`
- `UNATTENDED_MODE`
- `CONTENT_REVIEW_MODE`
- `CONTENT_SOURCE_RESULT_LIMIT`
- `CONTENT_PAGE_COUNT_TARGET`

### 内容 AI

- `CONTENT_AI_PROVIDER`
- `CONTENT_AI_ENDPOINT`
- `CONTENT_AI_API_KEY`
- `CONTENT_AI_MODEL`

### Firecrawl 证据层

- `FIRECRAWL_ENABLED`
- `FIRECRAWL_CLI_BIN`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_API_URL`
- `FIRECRAWL_AGENT_ENABLED`

启用后：

- `fetchSearchResults` 优先走 Firecrawl search
- 选中的 source-pack URL 会做 Firecrawl scrape
- 官方 / 竞品域名会做 Firecrawl map，补更深的 pricing/docs/changelog 页面
- 可选 Firecrawl agent 会把这些 URL 汇总成更结构化的 `research-dossier` 候选

### 商业 / CTA

- `CONTACT_CTA_URL`
- `SPONSORED_SLOT_URL`

### 真实表单收集 / 资产交付

- `DELIVERY_API_BASE_URL`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_REQUIRED`
- `CLOUDFLARE_R2_BUCKET`
- `EMAIL_DELIVERY_PROVIDER`
- `RESEND_API_KEY`
- `ASSET_FROM_EMAIL`
- `CONSULT_FROM_EMAIL`
- `DELIVERY_REPLY_TO`
- `DELIVERY_TOKEN_TTL_HOURS`
- `ASSET_OWNER_EMAIL`
- `CONSULT_OWNER_EMAIL`

启用后：

- asset landing page 会拦截表单，提交到 `automiora-api`
- API 会把 lead 写入 D1
- thank-you page 会优先使用一次性 delivery token 走后端下载
- 表单会自动带上 `utm / first touch / last touch / referrer / cta variant`
- delivery token 会记录过期时间，并支持 resend delivery
- 配好 `Resend` 后，asset delivery 和 consult acknowledgement 会真实发信
- 若 R2 还没同步，API 会自动回退到站内静态 markdown 下载

### Google 真数据

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GSC_SITE_URL`
- `GA4_PROPERTY_ID`
- `GA4_MEASUREMENT_ID`
- `GA4_CONVERSION_EVENTS`

兼容 service account：

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_AUTH_PREFERENCE`

固定 runner 建议：

- GitHub Actions 只配置 service account，不放个人 refresh token
- `GOOGLE_AUTH_PREFERENCE=service_account_first`
- 给同一个 service account 同时授予：
  - Search Console property `sc-domain:<your-domain>`
  - GA4 property 的只读权限
- 定时任务跑 `pnpm run monitoring:refresh:live`
- 运行结果查看 `live-monitoring-refresh.json` artifact 和 workflow summary

仓库已内置一个独立 workflow：

- `.github/workflows/monitoring-live.yml`

它会每天定时执行 live monitoring，并在 GSC/GA4 不是 `live` 时直接标红，避免 silent fallback。

如果你要让 `seo:submit` 调用 GSC sitemap submit，而不是只读 GSC/GA4 数据，重新执行一次：

```bash
pnpm run google:oauth
```

新的 refresh token 需要包含 `https://www.googleapis.com/auth/webmasters` scope。

### Release automation

- `CLOUDFLARE_PAGES_PROJECT`
- `CLOUDFLARE_PAGES_BRANCH`
- `RELEASE_SITE_SLUG`
- `RELEASE_ASSET_SLUG`
- `AUTO_RELEASE_ENABLED`
- `AUTO_RELEASE_ON_GATE_PASS`
- `INDEXNOW_KEY`
- `INDEXNOW_HOST`
- `INDEXNOW_KEY_LOCATION`

初始化或同步 IndexNow key 文件：

```bash
pnpm run seo:indexnow:init -- --write-env
```

`pnpm run release:prod` 会串起来跑：

- `lint`
- `pipeline`
- `seo:indexnow:init`
- `build`
- `worker:r2:sync`
- `worker:d1:migrate`
- `worker:deploy`
- `wrangler pages deploy dist --project-name <project> --branch <production-branch>`
- `release:health`
- `seo:diagnostics`
- `seo:submit`
- `www -> apex` 跳转校验
- `deliver` 的 `HEAD` / `GET` 验证
- GA4 realtime 验证

默认 production branch 读取：

- `CLOUDFLARE_PAGES_BRANCH`
- 未设置时默认 `main`

重要说明：

- Cloudflare Pages 如果不显式指定 production branch，当前 git 分支部署很容易只生成一个 preview alias，而不会切换 `automiora.com` 主站内容。
- 所以看到 `*.pages.dev` preview 更新，不等于主站已经切到新版本。
- 发布后至少做一次主站核对：
  - `https://automiora.com/generated-sites/<site-slug>/`
  - 对比 production 主站与最新 preview / 本地 `dist` 是否一致
- 如果主站和 preview 内容不一致，优先检查这次 Pages deploy 是否真的发到了 `CLOUDFLARE_PAGES_BRANCH`。

输出会落到：

- `storage/release-runs/*/report.json`
- `storage/release-runs/*/report.md`

## 人工审校入口

默认是无人值守模式，但系统保留了可选人工入口：

1. 跑 `pnpm run pipeline`
2. 打开 `storage/review-overrides.template.json`
3. 复制成 `storage/review-overrides.json`
4. 只改你关心的字段
   - `intro`
   - `ctaCopy`
   - `verdicts`
   - `keyFacts`
   - `sectionParagraphs`
5. 再跑一次 `pnpm run pipeline`

下一轮生成会自动应用这些人工覆盖。

## 资产验收原则

页面过 Gate 2 不等于资产可以直接交付。

现在系统的默认产品原则是：

- 自动化负责生成资产主干
- 人只做高杠杆验收
- 不默认逐段人工润色
- 不通过时优先打回 AI 定向重写

完整规范见：

- [Asset Acceptance Gate](/Users/max/code/trend-site-mvp/docs/ASSET-ACCEPTANCE-GATE.md)

## 内容回流闭环

现在 pipeline 不只是记录反馈，还会自动把反馈变成规则：

1. 读取上一轮：
   - `storage/content-feedback.json`
   - `storage/pipeline-history.json`
   - `storage/review-overrides.json`
   - `storage/content-playbook.json`
2. 生成新的 `content-playbook`
   - page type 目标值
   - site-level CTA / title / support-page 策略
   - manual review pattern
3. 下一轮 `pnpm run pipeline` 会把这些规则直接注入页面生成

也就是说，现在已经形成：

`生成 -> 监控/审校 -> playbook -> 下一轮生成`

## Hermes Wiki 资产层

现在 pipeline 还会同步产出一套内容资产主库：

- `wiki/01-theses/`
- `wiki/02-clusters/`
- `wiki/03-sources/`
- `wiki/04-claims/`
- `wiki/05-page-briefs/`
- `wiki/06-assets/`
- `wiki/07-reviews/`
- `wiki/08-experiments/`

可读索引：

- `public/generated/wiki-index.json`

## 文档

- [产品 PRD](/Users/max/code/trend-site-mvp/docs/PRD.md)
- [Asset Acceptance Gate](/Users/max/code/trend-site-mvp/docs/ASSET-ACCEPTANCE-GATE.md)
- [当前缺口与路线图](/Users/max/code/trend-site-mvp/docs/GAP-ROADMAP.md)
- [操作文档](/Users/max/code/trend-site-mvp/docs/OPERATION.md)
- [系统说明](/Users/max/code/trend-site-mvp/docs/SYSTEM.md)
- [待办列表](/Users/max/code/trend-site-mvp/docs/TODO.md)
