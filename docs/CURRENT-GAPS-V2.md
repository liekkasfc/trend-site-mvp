# Trend Site Pipeline 当前缺口清单 v2

## 1. 这份文档的用途

这份文档只回答 4 个问题：

1. 现在系统已经真正完成了什么
2. 现在还差什么
3. 这些缺口按“离收益有多近”应该怎么排优先级
4. 哪些旧文档还能继续看，哪些结论已经偏旧

这份文档默认以 `2026-05-03` 的真实验收结果为准，而不是以更早阶段的设计状态为准。

---

## 2. 当前真实状态

### 2.1 已经打通的部分

当前已经不是“会跑 demo 的自动建站脚本”，而是有一条真实可验收的生产链路：

- Cloudflare Pages / Worker / D1 / R2 已接通
- `release:prod` 已可真实发布
- `www -> apex` 跳转已校验
- `deliver HEAD / GET` 已校验
- GSC sitemap submit 已通过
- IndexNow 已通过
- GA4 realtime 事件链已通过
- D1 lead / asset delivery / resend / lifecycle 基础字段已接通
- Hermes Wiki 已作为 canonical content asset store 落地

最新真实发布结果见：

- [latest-successful.json](<repo-root>/storage/release-runs/latest-successful.json)
- [release report](<repo-root>/storage/release-runs/2026-05-03T07-22-23-326Z-prod-ai-video-workflow-short-form-demo/report.md)

### 2.2 现在不缺什么

这些东西当前不是主瓶颈：

- 不缺“再多一个自动化节点”
- 不缺“再补一个发布适配器”
- 不缺“再换一个域名”
- 不缺“再多生成几页 demo 页面”
- 不缺“再证明一遍基础链路能跑”

当前瓶颈已经从“能不能跑”切换成“能不能稳定拿流量和收益”。

---

## 3. 当前剩余缺口

下面按“对收益影响”排序，不按工程模块排序。

### Gap A. 高质量内容自动生产还不够稳

这是当前第一缺口，也是最重要的缺口。

系统已经能做：

- `source-pack -> research-dossier -> claim -> page brief -> HTML`
- anti-generic audit
- evidence-driven 页面生成

但还没有稳定做到：

- 连续产出 `30-50` 页仍然保持“明显像研究员整理过”的质感
- comparison / workflow / pricing / template-kit 这类高价值页长期维持信息差
- 自动 refresh 后真的补进新证据，而不是重复旧证据
- 页面在“具体数字 / 对比逻辑 / 失败模式 / recommendation”上稳定足够厚

这类缺口如果不补，结果会是：

- 页面合格，但未必值得点
- 页面能上线，但未必能进竞争区
- 页面有 CTA，但流量起不来

完成标准：

- 关键页型都能稳定含有命名对象、具体数字、对比逻辑、失败模式、明确推荐
- source refresh 能触发真实内容升级
- review queue 拦住的是“价值不够”，而不只是“格式不对”

### Gap B. Hermes Wiki 还是骨架，还没完全成为系统大脑

现在 Wiki 已经是 canonical store，这一步方向是对的。

但当前还没完全做到：

- 页面生成优先从 Wiki 资产推演，而不是靠本轮产物补齐
- 表现好的 claim / brief / asset 能系统化复用
- 表现差的 claim / brief / asset 能被淘汰或降权
- 多 thesis 间的资产复用真正可控

这类缺口如果不补，结果会是：

- 系统会“记住很多东西”，但不会优先使用最好用的东西
- 每轮都像重新做一遍，而不是越来越像有经验的团队

完成标准：

- HTML 级优化优先回写到 claim / brief / asset
- Wiki 卡有质量评分、使用频次、表现反馈、淘汰状态
- 下一轮生成能显式优先复用高表现资产卡

### Gap C. 转化后端可用，但还不是 revenue backend

现在已经有：

- form submit
- delivery token
- R2 download
- resend
- attribution 基础字段
- GA4 事件链

但还缺：

- lead lifecycle 的经营层
- follow-up queue / owner / contacted / qualified / won / lost
- 真实邮件 drip / 人工跟进待办
- CRM 视图
- 付费资产 / 支付 / 订单 / 履约
- consent / unsubscribe / suppression

这类缺口如果不补，结果会是：

- 有 lead，但不知道该怎么继续变现
- 知道谁下载了，不知道谁值得跟进
- 能交付资产，但不能系统化经营收入

完成标准：

- 能区分测试 lead、真实 lead、已跟进 lead、成交 lead
- 能回答哪个 `page -> asset -> follow-up` 路径最赚钱
- 至少有一个真实“继续付费/继续咨询”的后续动作

### Gap D. 排名/转化优化闭环还偏轻

现在有监控和验收，但优化系统还不够深。

还缺：

- 标题 / 描述 / hero entry 的版本化优化
- asset-level CTA 版本对照
- page-level refresh / rewrite / retire 触发器
- 用真实数据而不是 modeled rate 来更新资产排序
- 把 GSC / GA4 / delivery / commercial ops 真正回写到 Wiki 优先级

这类缺口如果不补，结果会是：

- 系统能发布，但不会越跑越强
- 资产表现数据有了，却没有形成自动调参

完成标准：

- top50 / CTR / delivery / deeper action 能联动触发改写或扩张
- asset performance 不再主要依赖 modeled rate
- 优化动作能形成历史对照和淘汰依据

### Gap E. 多 thesis 扩张还没被真实验证

现在更接近：

`单 thesis 高质量样板系统`

还不是：

`可同时经营多个 thesis 的无人值守操作系统`

还缺：

- 第二个 thesis 的真实复制验证
- 多站点调度和失败重试
- 多站点 refresh / optimize / retire 统一策略
- 跨 thesis 的资产复用边界

完成标准：

- 第二个 thesis 从 candidate -> active -> deploy -> submit -> monitor 跑通
- 多站点不会因为单站异常把整条链路拖垮

---

## 4. 按收益影响排序的路线图

### Priority 1. 内容竞争力层

先补：

1. 关键页型的研究员标准
2. source-pack 的更深证据层
3. refresh 后的二次改写规则
4. anti-generic audit 与 review queue 的高信噪比门禁

为什么第一优先级是它：

- 没有稳定的内容竞争力，SEO 流量起不来
- 没有稳定流量，商业承接再强也只是低量自转

验收口径：

- 关键页型能稳定打出更高证据密度
- 至少一批页进入真实曝光观察区

### Priority 2. Wiki-first 内容资产层

先补：

1. claim / brief / asset 质量评分
2. writeback 优先级
3. 复用规则
4. 淘汰与降权规则

为什么第二优先级是它：

- 这是把“偶尔做得好”变成“系统越来越会做”的核心
- 它决定系统会不会从自动化脚本，变成真正的内容操作系统

验收口径：

- 高表现结构下一轮能被明确优先复用
- 低表现结构会被系统降权

### Priority 3. Revenue backend

先补：

1. lifecycle / owner / follow-up queue
2. consult / paid pack / deeper offer
3. CRM 视图
4. 合规与抑制列表

为什么第三优先级是它：

- 现在链路已经能收 lead，但还不能系统化经营收入
- 流量一旦起来，这层会立刻成为主瓶颈

验收口径：

- 至少有一条 lead -> follow-up -> 商业动作 的真实路径
- 能回答“哪个资产最赚钱”，而不只是“哪个资产下载最多”

### Priority 4. 优化自动化层

先补：

1. title / meta / hero 迭代
2. page refresh / rewrite / retire 触发器
3. asset ranking 用真实表现替换 modeled rate
4. GSC / GA4 / delivery / commercial ops 联合回写

为什么第四优先级是它：

- 它不是第一推动力，但它决定系统会不会越跑越强

### Priority 5. 多 thesis 扩张层

最后补：

1. 第二个 thesis 验证
2. 多站点调度
3. 多站点告警 / 重试 / 运维

为什么放最后：

- 现在扩张会放大内容与商业层的薄弱处
- 单 thesis 收益闭环没稳之前，扩张只会增加噪音

---

## 5. 建议的下一阶段开发顺序

### Wave 1. 把“内容更像真人研究产物”做稳

目标：

- 让 `free-vs-paid / pricing / alternatives / template-kit / workflow` 这些页型持续变厚

建议动作：

1. 更深的官方层和社区层证据
2. 更强的 verdict / caveat / failure mode 抽取
3. refresh -> rewrite 规则
4. 让 Gate 2 更关注“有没有价值密度”

### Wave 2. 让 Wiki-first 真正主导下一轮生成

目标：

- 让系统优先复用高表现 claim / brief / asset，而不是只把它们归档

建议动作：

1. claim score
2. asset score
3. brief reuse priority
4. writeback queue 去重与排序

### Wave 3. 把商业承接从“交付”推进到“经营”

目标：

- 不只把文件交出去，而是能继续跟进和转化

建议动作：

1. follow-up queue
2. owner / status / notes
3. consult & paid offer path
4. CRM-like operator view

### Wave 4. 再做第二个 thesis 复制验证

目标：

- 证明系统不是单站样板，而是真的可复制

建议动作：

1. 选一个 thesis
2. 跑完整 candidate -> active -> deploy -> submit -> monitor
3. 对比第一站和第二站的复用率、生成质量、转化效率

---

## 6. 哪些文档现在还能继续看

### 仍然可信

- [docs/SYSTEM.md](<repo-root>/docs/SYSTEM.md)
  - 系统骨架和边界说明仍然可信
- [docs/OPERATION.md](<repo-root>/docs/OPERATION.md)
  - 操作流程大体可信，尤其是发布/验收链路
- [docs/ASSET-ACCEPTANCE-GATE.md](<repo-root>/docs/ASSET-ACCEPTANCE-GATE.md)
  - 资产验收标准仍然有价值

### 部分过时，应当按“历史材料”来看

- [docs/PRD.md](<repo-root>/docs/PRD.md)
  - 第 1 节里“当前版本：P1 + P2 已闭环，P3 标准已定义”偏旧
  - 现在不是只“定义了 P3 标准”，而是已经完成了大块 P3 基础设施

- [docs/TODO.md](<repo-root>/docs/TODO.md)
  - `Priority 1 / 2 / 3` 顶层复选框仍是未完成，但很多下层项已经完成
  - “当前剩余”部分里关于 `live submit` 的描述偏旧，现在 GSC + IndexNow 已真实通过
  - 它仍然适合看历史设计，不适合直接当最新状态面板

- [docs/GAP-ROADMAP.md](<repo-root>/docs/GAP-ROADMAP.md)
  - 其中 “现在更像 SEO 资产生成器，还不是 SEO 提交操作器” 已偏旧
  - “当前 live submit 仍依赖 GSC_SITE_URL / Google auth / INDEXNOW_KEY” 这句技术上没错，但状态判断偏旧，因为 adapter 已经落地并通过
  - 更适合看“为什么当时这么排优先级”，不适合看“现在到底完成到哪”

---

## 7. 一句话结论

当前系统的主问题已经不是“基础设施不完整”，而是：

`如何把已经打通的链路，升级成稳定产出高质量内容、稳定拿到搜索流量、并把流量继续经营成收入的系统。`

所以接下来最该做的，不是继续补部署，而是按下面顺序推进：

1. 内容竞争力层
2. Wiki-first 资产层
3. Revenue backend
4. 优化自动化
5. 多 thesis 扩张
