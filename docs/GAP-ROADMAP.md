# Trend Site Pipeline 当前缺口清单 + 优先级路线图

> 状态提示（2026-05-03）：这份路线图保留了更早阶段的判断。当前以真实发布、SEO 提交、GA4 验收后的最新状态为准，请优先看 [CURRENT-GAPS-V2.md](/Users/max/code/trend-site-mvp/docs/CURRENT-GAPS-V2.md)。

## 1. 这份文档是干什么的

这不是 PRD，也不是历史 TODO 汇总。

这份文档只回答 3 个问题：

1. 现在系统还缺什么
2. 这些缺口的优先级怎么排
3. 下一步应该按什么顺序继续执行

适用场景：

- 继续做 `AI Video Workflow / automiora.com` 单 thesis 验证
- 避免过早扩第二个 thesis
- 避免继续堆页面但不提升流量和收益能力

---

## 2. 当前状态快照

基于当前 `pipeline-report`，系统已经具备这些基础能力：

- `10` 个高意图页型已经跑通
- `3` 个 conversion asset 已有 landing / thank-you / download / GA4 事件链
- Gate 1 = `pass`
- Gate 2 = `pass`
- audit = `100 / pass`
- GSC / GA4 已接真数据
- Hermes Wiki 主资产结构已落地

但当前真实增长状态仍然偏早期：

- GSC `impressions = 0`
- GSC `clicks = 0`
- live `top50 keyword count = 0`
- GA4 `conversions = 2`
- revenue = `0`

这意味着：

- 结构闭环已经成立
- 内容系统已经能生成“合格页面”
- 但还没有证明系统能稳定拿到搜索流量
- 也还没有证明系统能稳定带来真实商业收益

一句话判断：

`现在的主要矛盾，已经不是“有没有链路”，而是“链路能不能持续拿流量并转成收益”。`

---

## 3. 不缺什么

下面这些暂时不是当前主优先级：

- 不缺新的页型
- 不缺新的 thesis 路由机制
- 不缺新的域名
- 不缺再多生成几个 demo 页面
- 不缺再补一轮“能跑”的自动化节点

这些能力已经基本够用。

当前问题不在“结构不完整”，而在：

- 内容竞争力还不够稳
- SEO 获取流量还没跑起来
- 资产虽然能交付，但可卖性还不够强

---

## 4. 当前缺口清单

### Gap A. 高质量内容生产还没“稳”

这是当前最大的缺口。

系统现在已经能做：

- `source-pack -> research-dossier -> claim -> page brief -> HTML`
- anti-generic audit
- evidence-driven 页面生成

但还没有稳定做到：

- 持续产出“明显强于首页普通结果”的页面
- comparison / workflow / pricing 页持续有真实信息差
- 老页面能自动 refresh，而不是一次生成后变旧
- 自动生成内容能稳定带着“研究员感”和“编辑判断”

#### 这类缺口的表现

- 页面虽然合格，但不一定会让用户觉得“这页更值得点”
- 内容能读，但未必会让 Google 更愿意给曝光
- 同类页面之间还不够容易形成持续优势

#### 这类缺口的完成标准

- 关键页型都具备更强 source synthesis
- 页面可以稳定包含：
  - 具体数字
  - 命名对象
  - 对比逻辑
  - 失败模式
  - 明确 recommendation
- 页面刷新规则能自动触发二次改写

---

### Gap B. SEO 获取流量能力还没验证

这是当前第二大缺口。

虽然 GSC / GA4 已接通，但当前真实搜索数据仍然说明：

- 站点还没有稳定进入搜索竞争区
- 当前站点还不处于“持续可见”的状态

#### 还缺什么

- 标题 / description / entry visual 的系统化迭代
- 收录与索引诊断机制
- 更强的内部链接结构
- 对页面 freshness 的运营节奏
- 更真实的分发 / 外链 / mention 能力

#### 当前判断

现在系统已经能发布，但还不能说“已经具备稳定 SEO 增长能力”。

#### 完成标准

- 至少有一组高意图页面进入真实曝光
- 至少有关键词开始进入 top-50 观察区
- 标题 / 描述 / 首屏入口的优化动作能形成可复盘对照

---

### Gap C. 转化资产有链路，但可卖性还不够强

现在的资产系统已经有：

- asset landing
- thank-you
- downloadable file
- GA4 click / submit / delivery

这说明“交付链路”已经有了。

但现在还不够强的地方在于：

- `prompt-pack / workflow-checklist / comparison-worksheet` 还需要继续变厚
- 资产更像“高质量 lead magnet”，还不完全像“明确可卖产品”
- 还缺真正的付费承接与商业动作
- 还缺 asset-level 的真实优劣比较

#### 还缺什么

- 更强的 asset body
- consult / audit / paid pack 路径
- 更明确的 buyer intent 区分
- 更真实的 commercial follow-up

#### 完成标准

- 资产不仅能下载，还能明显帮助用户推进工作
- 至少能识别：
  - 哪类资产下载率更高
  - 哪类资产更容易触发 deeper action
- 至少形成一个“可继续付费 / 可继续咨询”的真实承接位

---

### Gap D. Hermes Wiki 已经成骨架，但还没完全成为“系统大脑”

Hermes Wiki 现在已经是 canonical content asset store，这一步是对的。

但还没完全做到：

- 页面生成优先从 Wiki 知识资产推演，而不是从本轮产物反推
- claim / asset / brief 有更明确的质量评分和淘汰机制
- 表现好的内容模式能被真正沉淀成通用资产
- 多 thesis 之间能稳定复用资产卡

#### 还缺什么

- claim 生命周期管理
- asset 评分和复用策略
- review / experiment 的回流深度
- 更强的 wiki-first 内容生成规则

#### 完成标准

- 页面优化不是只改 HTML，而是回写到 claim / brief / asset 层
- 同类高表现结构能被下一轮生成直接复用

---

### Gap E. 无人值守还差运维层和扩张层

当前系统更接近：

`单 thesis 高质量样板系统`

还不是：

`可稳定管理多个生产站点的无人值守操作系统`

#### 还缺什么

- 定时调度
- 失败重试
- 异常告警
- 多站点部署 adapter
- 自动 refresh / optimize / retire
- 第二个 thesis 的真实扩张验证

#### 完成标准

- 单 thesis 不需要人工盯着也能定期运行
- 多 thesis 才值得进入下一阶段

---

## 5. 优先级结论

当前优先级必须这样排：

### Priority 1

`先把内容竞争力和资产可用性继续做强`

也就是：

- 高质量内容生产
- 强资产本体
- 关键页型内容 refresh

### Priority 2

`再验证 SEO 曝光和真实商业动作`

也就是：

- 标题 / 描述 / entry visual 优化
- 索引 / 收录推进
- asset 深动作验证

### Priority 3

`最后再扩站、扩资产数、扩第二个 thesis`

也就是：

- 30 pages
- 30 assets
- 第二个 thesis 晋升
- 多站点无人值守

如果顺序反了，风险很大：

- 会继续堆页面
- 会继续堆 automation
- 但流量和收益还是起不来

---

## 6. 执行路线图

下面是适合直接继续执行的版本。

### Phase A. 内容与资产强化

这是当前最高优先级。

#### A1. 做强剩余资产本体

目标：

- 把 `workflow-checklist`
- 把 `comparison-worksheet`

继续从“可下载”升级成“拿来就能工作”。

重点动作：

- 增加更具体的使用情境
- 增加明确的第一步动作
- 增加更强的对比维度 / decision logic
- 增加更真实的 handoff / reuse 内容

验收标准：

- 下载内容本体明显厚于当前版本
- 用户拿到后不需要自己再补很多上下文

#### A2. 做强高意图页型的内容刷新机制

范围：

- `workflow`
- `pricing`
- `free-vs-paid`
- `template-kit`
- `case-study`

重点动作：

- 让页面支持 refresh triggers
- 老页面可基于 source / claim 更新自动重写关键段
- 把“信息差不足”的页型列入优先更新清单

验收标准：

- 老页面不是一次性产物
- 页面能随着 source / claim 变化变强

#### A3. 建立关键页型的“更像真人研究产物”标准

重点动作：

- comparison 页补更强结论逻辑
- workflow 页补更真实 failure points
- pricing 页补更真实 hidden-cost logic
- case-study 页补更可信的 before / after / intervention

验收标准：

- 页面不只是结构完整，而是真有“决策帮助”

---

### Phase B. SEO 增长验证

这是第二优先级。

#### B1. 做标题 / description / 首屏入口优化

重点动作：

- 改强首页和关键商业页的 title
- 改强 meta description
- 补 entry visual / 首屏点击理由
- 让首屏更像“值得点”的专题站页，而不是内部工具页

验收标准：

- 至少形成一轮可复盘优化记录
- 有页面进入真实 impression 观察区

#### B2. 做索引 / 收录诊断

重点动作：

- 检查 sitemap / robots / canonical / internal links
- 检查哪些页应该 index、哪些页暂时 noindex
- 明确哪些页是 primary entry pages

验收标准：

- 索引问题不再是黑箱
- 收录状态能进入下一轮优化决策

#### B3. 建立 SEO 侧的 refresh / optimize 队列

重点动作：

- 让低曝光页进入 SEO queue
- 让高 impression 低 CTR 页进入 title/description queue
- 让 high-intent 页优先获得 refresh

验收标准：

- Gate 3 输出的动作可以直接驱动内容改动

---

### Phase C. 商业承接验证

这是第三优先级，但必须在 Phase B 并行观察。

#### C1. 补更真实的 commercial action

重点动作：

- 增加 consult / audit offer
- 增加更明确的 paid pack 方向
- 区分：
  - low-friction download
  - deeper consult action
  - commercial clickout

验收标准：

- 不只是“有 CTA”
- 而是不同 CTA 有不同商业含义

#### C2. 做 asset-level 表现比较

重点动作：

- 看哪个 asset 下载率更高
- 看哪个 asset 更容易带来 deeper action
- 看哪个 page -> asset 路径更强

验收标准：

- 至少能识别 `1` 类更强页面 + `1` 类更强资产

#### C3. 区分“测试事件”和“真实商业信号”

重点动作：

- 把测试下载和真实用户动作分开
- 不把结构性 submit 误判成商业成功

验收标准：

- `generate_lead / delivery / clickout / consult`
  的数据解释更可信

---

### Phase D. Hermes Wiki 深化

这部分不是最前面的 blocker，但要持续补。

#### D1. 做 claim / brief / asset 的评分和淘汰

重点动作：

- 哪些 claim 经常被复用
- 哪些 brief 结构表现更好
- 哪些 asset 说明更强

验收标准：

- Wiki 资产不只是归档，而是可被排序和淘汰

#### D2. 做 wiki-first 回写

重点动作：

- 人工优化不只改页面
- 要能沉淀回：
  - claim
  - page brief
  - conversion asset

验收标准：

- 下一轮生成真的“记住了”

---

### Phase E. 无人值守与扩张

这是最后一层。

#### E1. 做运行调度和告警

#### E2. 做真实部署 adapter

#### E3. 做第二个 thesis 晋升验证

进入这一步的前提是：

- 单 thesis 已有真实流量迹象
- 单 thesis 已有可信商业信号
- 资产和页面的优劣已经能判断

---

## 6.1 四个工程化缺口的真实状态

这一组不是“要不要做”，而是“先后顺序和完成边界要更清楚”。

### 1. 真实部署适配器

当前已经有：

- `Cloudflare Pages + Worker + R2` 的实际发布路径
- `automiora-release` skill
- `www -> apex` 跳转校验
- `deliver HEAD/GET` 验收
- 发布后 GA4 realtime 验收脚本

当前还缺：

- pipeline 在 `Gate 2 pass` 后自动调用真实发布 adapter，而不是停在 `local-static-preview`
- staging -> production 的晋升动作
- 回滚、失败重试、健康检查、告警
- 多 provider 抽象，而不是只偏 Cloudflare
- 域名 / redirect / 环境变量的 API 化管理

当前判断：

这块已经不是 0 到 1 问题，已经具备“可执行发布”的基础，但还不算“系统自动发布”。

最新进展：

- 已补 `release:prod + release:health + worker:d1:migrate + seo:diagnostics + seo:submit`
- 已补 pipeline 内的 `AUTO_RELEASE_ENABLED / AUTO_RELEASE_ON_GATE_PASS`
- 当前 live 发布仍依赖 `CLOUDFLARE_API_TOKEN`

完成标准：

- pipeline 能按 gate 决策自动进入真实发布
- 发布失败有明确回滚或重试路径
- 单 thesis 不需要人工盯着也能稳定发版

### 2. 真实 SEO 提交适配器

当前已经有：

- `sitemap.xml`
- `robots.txt`
- `llms.txt`
- SEO queue / blocked URL / queued URL
- GSC + GA4 真数据读取

当前还缺：

- 真正的 URL 提交客户端
- 提交状态记录、失败重试、冷却机制
- `Bing / IndexNow` 这一类 live adapter
- Google 侧“哪些页可自动处理、哪些页只做状态监控”的边界
- canonical / schema / hreflang / internal link 的自动体检
- 提交后索引状态的回流闭环

当前判断：

现在更像“SEO 资产生成器”，还不是“SEO 提交操作器”。

最新进展：

- 已补 `GSC sitemap submit` adapter
- 已补 `IndexNow` adapter 和 submission state store
- 已补 `SEO diagnostics` 与 `release health` 产物
- 当前 live submit 仍依赖 `GSC_SITE_URL / Google auth / INDEXNOW_KEY`

完成标准：

- 至少有一条真实提交链路稳定可用
- 提交、失败、重试、收录状态都能落盘
- 索引问题不再靠人工去 Search Console 里猜

### 3. 更深的 source-pack 数据源

当前已经有：

- `source-pack -> research dossier -> claim -> page brief -> HTML`
- Firecrawl search / scrape / map
- 一部分 GitHub / HN / Hugging Face / SERP 信号

当前还缺：

- 更稳定的社区层：`X / Reddit / YouTube transcript / Product Hunt / G2 / Capterra`
- 更强的 SERP 扩展：PAA、相关搜索、自动补全、长尾补词
- 更深的官方层：docs / pricing / changelog / templates / use cases
- source scoring：可信度、时效性、冲突检测、去重
- refresh scheduler：什么时候全量抓、什么时候增量抓
- 更厚的“用户抱怨 / 替代方案 / 失败模式”层

当前判断：

现在能抓到材料，但还不够像研究员在持续做证据采集。

最新进展：

- 已补 `product / video / relatedQueries`
- 已补 `credibilityScore / freshnessScore / sourceQualityScore / sourceSubtype`
- 已补 `source-refresh-queue`

完成标准：

- 页面不是只靠一轮网页抓取，而是能稳定拿到官方、社区、竞品、SERP 四层证据
- source-pack 能给出来源质量判断，而不是只堆 URL
- refresh 后能真正补新证据，而不是重复旧信息

### 4. 更强的商业承接后端

当前已经有：

- `asset_leads / consult_requests`
- D1 入库
- Turnstile
- token 化下载交付
- R2 / 静态 fallback
- GA4 click / submit / delivery 事件链

当前还缺：

- 真正的邮件发送层
- 归因字段：`utm / first touch / last touch / referrer / CTA variant`
- lead lifecycle：`new / contacted / qualified / won / lost`
- 自动 follow-up：邮件 drip、人工跟进待办
- asset 版本管理、重复领取、过期策略
- 管理后台 / CRM 视图
- 合规：consent、unsubscribe、suppression
- 如果进入付费，还缺 payment / order / invoice / fulfillment

当前判断：

现在是“可用的 lead backend”，还不是“完整的 revenue backend”。

最新进展：

- 已补 `Resend` 邮件发送适配
- 已补 `utm / first touch / last touch / referrer / CTA variant`
- 已补 `lifecycle / followup / email delivery` 字段
- 已补 `token expiry + resend delivery`

完成标准：

- 能区分测试 lead、真实 lead、已跟进 lead、成交 lead
- 能回答哪个 page -> asset -> follow-up 路径最赚钱
- 交付不只是下载完成，而是能进入下一步商业动作

### 这四块的优先级结论

按“最影响系统价值”的顺序，建议这样排：

1. 更深的 `source-pack` 数据源
2. 更强的商业承接后端
3. 真实 SEO 提交适配器
4. 真实部署适配器收尾

原因不是部署不重要，而是：

- 部署已经基本能跑
- 真正卡收益的，是内容证据层和商业承接层还不够深

---

## 7. 当前建议的执行顺序

严格按这个顺序继续：

1. 扩大 `source-pack` 深度，先补社区 / 官方 / SERP / 竞品四层证据
2. `workflow-checklist / comparison-worksheet` 资产本体继续升级
3. `workflow / pricing / free-vs-paid / case-study` 内容 refresh 机制
4. consult / audit / paid pack 商业承接
5. 首页和关键商业页的 SEO 入口优化
6. 索引 / 收录 / entry pages 诊断 + live SEO 提交 adapter
7. claim / brief / asset 的 Wiki-first 回写
8. 调度 / 部署 / 第二个 thesis 扩张

---

## 8. 当前阶段的暂停线

在下面这些条件满足前，不建议继续把重点放到“扩张”上：

- 不建议优先扩第二个 thesis
- 不建议优先加更多域名
- 不建议优先把页面数从 `10` 扩到 `30`
- 不建议优先补更多自动化节点

因为现在最缺的是：

`更强内容 -> 更真实曝光 -> 更强转化资产 -> 可解释商业信号`

而不是更多结构。

---

## 9. 下一轮执行定义

如果要直接进入下一轮实现，建议把目标定义成：

### Next Execution Target

先完成这一组：

1. 补一轮更深的 `source-pack` 数据源
2. `workflow-checklist` 资产本体升级
3. `comparison-worksheet` 资产本体升级
4. richer 商业承接字段与 follow-up 设计
5. 首页 / hub / pricing / workflow 的 SEO 入口强化
6. 索引与 entry-page 诊断结果落盘

### 本轮完成标准

- 资产页不只是“能交付”，而是“更值得拿”
- 关键页不只是“通过审核”，而是“更值得被点”
- 下一轮开始前，系统能更明确地知道：
  - 哪些页是拉曝光主力
  - 哪些资产是承接主力

---

## 10. 一句话版本

现在这套系统最缺的，不是更多页面，也不是更多 automation。

最缺的是：

`持续更强的内容竞争力 + 真实 SEO 曝光验证 + 更像产品的转化资产`

只要这三件事跑通，后面的第二个 thesis、更多域名、更多页面，才值得放大。
