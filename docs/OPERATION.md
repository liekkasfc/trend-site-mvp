# Trend Site Pipeline 操作文档

这份文档只回答两类问题：

1. 平时怎么跑
2. 真数据和人工覆盖怎么接

## 1. 本地启动

```bash
pnpm install
pnpm run dev
pnpm run pipeline
```

默认前端：

- `http://localhost:4173/`

## 2. 修改后校验顺序

```bash
pnpm run lint
pnpm run build
pnpm run pipeline
```

如果这次是正式发布，不只是本地检查，直接跑：

```bash
pnpm run release:prod
```

## 3. 日常输出看哪里

最常用的文件：

- `public/generated/pipeline-report.json`
- `public/generated/phase1-validation.json`
- `public/generated/wiki-index.json`
- `public/generated-sites/*`
- `public/generated/content-artifacts/*`
- `wiki/*`
- `storage/pipeline-history.json`
- `storage/review-queue.json`
- `storage/content-feedback.json`
- `storage/content-playbook.json`
- `storage/phase1-validation.md`

## 4. thesis 晋升

把 candidate thesis 晋升成 active thesis：

```bash
pnpm run thesis:promote -- --candidate agent-infrastructure --domain agents.example.com --site-slug ai-agent-infrastructure
```

先预演：

```bash
pnpm run thesis:promote -- --candidate agent-infrastructure --domain agents.example.com --site-slug ai-agent-infrastructure --dry-run
```

这个动作会：

- 把 `config/thesis-registry.json` 里的 thesis 从 `candidate` 切到 `active`
- 绑定域名
- 绑定站点 slug
- 让它在下一次 `pnpm run pipeline` 进入真实建站链路

## 4.1 锁定 active site 主词

active thesis 推荐在 `config/thesis-registry.json` 里显式维护：

- `primaryKeywordStrategy`
- `pinnedPrimaryKeyword`
- `keywordBoundary`

推荐规则：

- active site: `primaryKeywordStrategy = pinned`
- candidate thesis: `primaryKeywordStrategy = dynamic`

这样 active site 会继续吸收边界内的新机会，但不会被新热词改写首页 thesis 主词。

## 5. 无人值守内容模式

默认就是：

- `UNATTENDED_MODE=true`
- `CONTENT_REVIEW_MODE=unattended`

这时系统会自动：

- 发现并路由热词
- 生成 source-pack
- 生成 research dossier
- 生成 Hermes Wiki 资产卡
  - thesis
  - cluster
  - source
  - claim
  - page brief
  - conversion asset
  - review / experiment
- 生成 facts JSON
- 生成 10 页标准 cluster
- 跑 Gate 2
- 只给未过关页面打 `noindex`
- 生成 review queue / feedback / next-run playbook

## 6. 可选人工审校

如果你想只改关键段，不想重写整页：

1. 先跑一次：

```bash
pnpm run pipeline
```

2. 打开：

- `storage/review-overrides.template.json`

3. 复制成：

- `storage/review-overrides.json`

4. 只改这些字段：

- `intro`
- `ctaCopy`
- `verdicts`
- `keyFacts`
- `sectionParagraphs`
- `reviewer`
- `reviewedAt`
- `notes`

5. 再跑一次：

```bash
pnpm run pipeline
```

系统会自动应用这些人工覆盖，并把对应页面从待 spot-check 队列里移出。

下一轮还会把这些人工动作折算进：

- `storage/content-playbook.json`

让同类页面在后续运行里自动提高具体度和 CTA 清晰度。

## 6.1 真实 asset delivery flow 怎么验

每次 `pnpm run pipeline` 后，检查：

- `public/generated-sites/<site-slug>/asset-*.html`
- `public/generated-sites/<site-slug>/asset-*-thank-you.html`
- `public/generated-sites/<site-slug>/downloads/*.md`

最低闭环：

- 页面 CTA 指向 asset landing page
- landing page 有表单
- 表单进入 thank-you page
- thank-you page 可下载真实文件
- GA4 事件包含：
  - `asset_cta_click`
  - `asset_form_submit`
  - `generate_lead` 或 asset 自身 conversion event
  - `asset_delivery`

如果要做本地人工验收，直接打开：

- `public/generated-sites/<site-slug>/template-kit.html`
- 再点 CTA 走完整条链路

## 6.1.1 接真后端后的最低上线步骤

1. 执行数据库建表：

```bash
pnpm run worker:d1:apply
pnpm run worker:d1:migrate
```

2. 把下载资产推到 R2（可选，但推荐）：

```bash
pnpm run worker:r2:sync
```

3. 部署 API Worker：

```bash
pnpm run worker:deploy
```

4. 在站点环境变量里确认：

- `DELIVERY_API_BASE_URL=https://api.automiora.com`
- `TURNSTILE_SITE_KEY=<你的 Turnstile site key>`
- `TURNSTILE_REQUIRED=false` 起步
- `EMAIL_DELIVERY_PROVIDER=resend`
- `RESEND_API_KEY=<你的 resend key>`
- `ASSET_FROM_EMAIL=<delivery sender>`
- `CONSULT_FROM_EMAIL=<consult sender>`
- `DELIVERY_TOKEN_TTL_HOURS=168`

5. 重新跑：

```bash
pnpm run pipeline
pnpm run build
```

这样生成出来的 asset landing / audit request 页面就会从“静态 thank-you 跳转”切到“真实 API 提交 -> D1 入库 -> token 化交付”。

## 6.1.2 一条命令跑发布验收

现在 repo 已经内置 release 脚本：

```bash
pnpm run release:prod
```

默认会按这个顺序执行：

1. `pnpm run lint`
2. `pnpm run pipeline`
3. `pnpm run build`
4. `pnpm run worker:r2:sync`
5. `pnpm run worker:d1:migrate`
6. `pnpm run worker:deploy`
7. `wrangler pages deploy dist --project-name $CLOUDFLARE_PAGES_PROJECT`
8. 跑 `release:health`
9. 跑 `seo:diagnostics`
10. 跑 `seo:submit`
11. 校验 `www -> apex` 301
12. 提交一条测试 lead
13. 校验 `/v1/deliver/:token` 的 `HEAD` 不增加 `delivery_count`
14. 校验 `GET` 真正把 lead 标成 `delivered`
15. 尝试读取 GA4 realtime 事件

输出文件：

- `storage/release-runs/*/report.json`
- `storage/release-runs/*/report.md`

相关环境变量：

- `CLOUDFLARE_PAGES_PROJECT`
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

如果只想跑某一段：

```bash
pnpm run release:health
pnpm run seo:indexnow:init
pnpm run seo:diagnostics
pnpm run seo:submit
pnpm run release:redirect -- --paths /,/generated-sites/ai-video-workflow-short-form-demo/asset-prompt-pack
pnpm run release:test-lead -- --site-slug ai-video-workflow-short-form-demo --asset-slug prompt-pack
pnpm run release:deliver -- --lead-id <lead-id> --delivery-token <token> --verify-get
pnpm run release:ga4 -- --site-slug ai-video-workflow-short-form-demo --asset-slug prompt-pack
```

注意：

- `release:test-lead` 是后端直提交流程，不会触发页面里的前端 `gtag`。
- 所以 `release:ga4` 最稳的用法，是先用浏览器真实走一遍 asset page -> thank-you -> download，再查 realtime。
- `seo:submit` 里 Google sitemap submit 需要 `GSC_SITE_URL + Google auth`，IndexNow 需要 `INDEXNOW_KEY + INDEXNOW_HOST`。
- 如果 `seo:submit` 返回 Google `ACCESS_TOKEN_SCOPE_INSUFFICIENT`，重新执行一次 `pnpm run google:oauth`，让 refresh token 包含 `https://www.googleapis.com/auth/webmasters` scope。
- `worker:d1:migrate` / `commercial:ops` / 正式 `release:prod` 都依赖可用的 `CLOUDFLARE_API_TOKEN`。
- 如果 `TURNSTILE_REQUIRED=true`，脚本提交流程需要真实 `turnstile token`，否则应该改走浏览器路径。

## 6.2 Phase 1 收益验证怎么看

系统会自动输出：

- `public/generated/phase1-validation.json`
- `storage/phase1-validation.md`

它主要回答三件事：

1. 当前单 thesis 是否具备上流量条件
2. 真实 asset delivery flow 是否完整
3. 现在该继续补内容，还是该先补转化与监控

## 6.3 Asset Acceptance Gate 现在怎么执行

页面通过 Gate 2 后，不要默认认为下载资产可以直接放行。

当前推荐流程是：

1. 先确认 asset delivery flow 已完整
   - landing
   - form
   - thank-you
   - download
   - GA4 click / submit / delivery
2. 再按资产类型分流
   - A 类：checklist / worksheet / shortlist
   - B 类：prompt-pack / template pack / comparison 下载物
   - C 类：consult / affiliate / 强商业承诺资产
3. 再做对应验收
   - A 类：自动检查通过后抽样 spot-check
   - B 类：`3-5` 分钟人工快审
   - C 类：`5-10` 分钟人工强审

人工快审默认只回答 5 个问题：

1. 解决的是不是一个明确动作
2. 用户下载后 10 分钟内能不能开始用
3. 有没有至少一个具体示例
4. 有没有明确 watch-out / failure point
5. CTA 承诺和实际交付是不是一致

如果任意一项不通过：

- 不建议直接人手重写整份 asset
- 先标出失败项
- 再回到生成层做定向重写
- 通过后再回写到 Wiki 资产卡

完整规则见：

- [`ASSET-ACCEPTANCE-GATE.md`](/Users/max/code/trend-site-mvp/docs/ASSET-ACCEPTANCE-GATE.md)

## 7. 启用 GSC + GA4 真数据

推荐 OAuth：

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GSC_SITE_URL`
- `GA4_PROPERTY_ID`
- `GA4_MEASUREMENT_ID`
- `GA4_CONVERSION_EVENTS`

获取 refresh token：

```bash
pnpm run google:oauth
```

兼容 service account：

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## 8. 内容 AI 配置

默认是 heuristic。

如果要切到外部模型：

```env
CONTENT_AI_PROVIDER=openai-compatible
CONTENT_AI_ENDPOINT=https://your-endpoint/v1/chat/completions
CONTENT_AI_API_KEY=...
CONTENT_AI_MODEL=...
```

### 可选：Firecrawl CLI 证据层

先在本机准备 Firecrawl CLI，然后把这些环境变量填上：

```env
FIRECRAWL_ENABLED=true
FIRECRAWL_CLI_BIN=firecrawl
FIRECRAWL_API_KEY=...
FIRECRAWL_AGENT_ENABLED=false
```

默认行为：

- search 优先走 Firecrawl
- source-pack 里的重点 URL 会 scrape 成结构化 evidence
- 官方 / 竞品站点会 map 更深层的 pricing / docs / changelog / template 页面
- `FIRECRAWL_AGENT_ENABLED=true` 时，才会额外跑 agent schema 提取

## 9. 商业模块配置

可选：

```env
CONTACT_CTA_URL=https://your-site.com/contact
SPONSORED_SLOT_URL=https://partner-site.com/
```

## 10. 常见问题

### 我想看内容资产层有没有正常产出

先看：

- `public/generated/wiki-index.json`
- `public/generated/content-artifacts/<site-slug>/research-dossier.json`
- `wiki/04-claims/*`
- `wiki/05-page-briefs/*`

如果这些文件都在，说明现在的页面已经不是直接从 source-pack 硬拼出来，而是经过：

`source-pack -> research dossier -> claim -> page brief -> page facts -> HTML`

如果还想确认 Wiki 资产已经反向参与生成，再看：

- `public/generated/content-artifacts/<site-slug>/facts/*.json`

重点字段：

- `pageBrief.manualSource`
- `claimCards[].manualSource`
- `assetBinding.primary.wikiId`

这些字段出现时，说明页面已经读回了 Wiki 里的人工资产，而不是只用本轮临时生成内容。

### Gate 2 没过

先看：

- `public/generated/pipeline-report.json`
- `storage/review-queue.json`
- `public/generated/content-artifacts/*`

重点看：

- `factCount`
- `verdictCount`
- `exampleCount`
- `sourceRefCount`
- `signalRichSourceCount`
- `lowSignalSourceCount`
- `specificityScore`
- `repeatedSentenceCount`
- `content-playbook` 里的 target 是否已经抬高

如果启用了 Firecrawl，再额外看：

- `source-pack.firecrawl`
- `source-pack.categories.deepResearch`
- `research-dossier.extractionSources`
- `research-dossier.assetIdeas`

### 页面被 `noindex`

说明当前站点还没通过 Gate 2。

通过后会自动恢复为 `index`。

### 第三关还是 forecast

说明 GSC 或 GA4 还有一侧没配好。看：

- `selectedSite.monitoring.gscStatus`
- `selectedSite.monitoring.ga4Status`
