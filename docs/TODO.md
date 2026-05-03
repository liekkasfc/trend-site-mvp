# Trend Site Pipeline 待办列表

> 状态提示（2026-05-03）：这份 TODO 保留了大量阶段性设计与历史任务。当前最新缺口和优先级，请优先看 [CURRENT-GAPS-V2.md](/Users/max/code/trend-site-mvp/docs/CURRENT-GAPS-V2.md)。

## P1

- [x] 实现 `candidate thesis -> active thesis` 晋升动作
  - 目标：当某个 candidate thesis 决定正式建第二个站时，可以一键推进，而不是手工改多处配置。
  - 预期动作：
    - 输入 `candidateKey`、目标域名、站点 slug
    - 把 `config/thesis-registry.json` 里的 thesis 从 `candidate` 切到 `active`
    - 绑定新域名，并补齐站点运行所需的基础字段
    - 让 pipeline 能基于该 thesis 继续聚类、生成页面、部署和提交 SEO
  - 验收标准：
    - 只需要一次命令或一次明确入口操作
    - 不需要手工编辑多份配置文件
    - 晋升后重新执行 `pnpm run pipeline`，该 thesis 可以进入真实建站链路

- [x] 启动 `内容升级 phase`，把内容生成从“模板填空”升级成“证据驱动生成”
  - 目标：让生成站点不只是能出页，而是真的具备可读性、信息差和初步竞争力。
  - 原则：
    - 先证据化，再生成
    - AI 当研究员、资料员、初稿作者，不直接替代主编判断
    - 质量提升优先于继续扩更多流程节点

## P1 - 高质量内容生产

- [x] 建 `source-pack` 流程
  - 目标：每个 page / cluster 先生成结构化证据包，再进入正文生成。
  - 最低来源层：
    - `official`：官网、文档、pricing、changelog
    - `competitive`：竞品页、对比页、替代页
    - `community`：Reddit、HN、论坛、评论、问答
    - `workflow`：教程、视频字幕、案例拆解
    - `serp`：标题、PAA、相关搜索、FAQ
  - 验收标准：
    - 每个页面都能落一份独立 `source-pack`
    - 生成时读取的是结构化证据，不是直接拼接原始网页

- [x] 定义 `fact-schema`
  - 目标：把抓到的信息抽成可复用的事实卡，而不是让模型反复读长网页。
  - 最低字段：
    - 核心定义
    - 适用人群
    - 价格和限制
    - 优点 / 缺点
    - 常见抱怨
    - 典型场景
    - 可比较维度
    - 具体事实
    - 更新时间
  - 验收标准：
    - 生成前能看到 page-level facts JSON
    - FAQ、comparison、workflow 页面都能复用同一份 facts

- [x] 实现 “证据驱动 AI 初稿” 生成模式
  - 目标：AI 基于 `source-pack + facts` 生成页面，不再直接套固定段落。
  - 生成约束：
    - 至少 2 个明确结论
    - 至少 3 个具体事实
    - 至少 2 个 caveat / watch-out
    - 至少 1 个真实例子或使用场景
    - 至少 1 段“谁不适合”
  - 验收标准：
    - 同一类页面在不同 topic 下，正文差异来自证据而不是只换关键词
    - FAQ 不能多个问题复用一套近似答案

- [x] 增加内容质检层 v2
  - 目标：把 Gate 2 从“结构审核”升级成“结构 + 证据 + 可用性审核”。
  - 需要新增的检查：
    - 页面是否包含具体事实
    - 页面是否包含明确 verdict
    - 页面是否包含例子 / caveat
    - 页面是否存在大段空泛重复话术
    - 页面结论是否能回溯到 source-pack
  - 验收标准：
    - 质量审核可以拦住“像文章但没信息量”的页面
    - 审核结果里能指出缺的是 facts、examples 还是 verdict

- [x] 增加人工审校入口
  - 目标：让人只介入高价值位置，而不是每页从头重写。
  - 先覆盖：
    - hub 页核心结论
    - alternatives 页推荐顺序
    - workflow 页步骤和坑点
    - lead magnet / CTA 文案
  - 验收标准：
    - 支持“AI 初稿 -> 人工审关键段 -> 发布”
    - 保留修改痕迹，便于后续反哺规则

## P1 - 强页面模板

- [x] 升级 `hub / alternatives / workflow / faq` 模板到 v2
  - 目标：让现有四页从 demo 页面升级成可竞争页面。
  - `hub` 必须包含：
    - topic 定义
    - 谁适合 / 谁不适合
    - 选择路径
    - supporting page 入口
    - 明确 next step
  - `alternatives` 必须包含：
    - 决策维度
    - verdict table
    - 每个选项的 best-for / not-for
    - 推荐顺序和理由
  - `workflow` 必须包含：
    - step-by-step
    - 输入 / 输出
    - 常见失败点
    - 示例 prompt 或 checklist
  - `faq` 必须包含：
    - 真实问题
    - 具体回答
    - 必要时链接回比较页或流程页
  - 验收标准：
    - 页面结构按类型明显分化
    - 不再只是统一骨架 + 少量文案变化

- [x] 增加新的页面类型
  - 目标：把 cluster 从 4 页扩到更接近真实站点的信息架构。
  - 候选页面：
    - `best-of`
    - `pricing`
    - `free-vs-paid`
    - `use-case`
    - `template`
    - `case-study`
  - 验收标准：
    - 单个 thesis 的标准 cluster 能扩到 8-12 页
    - 新页面类型能复用 source-pack 和 facts 体系

- [x] 给模板增加真实素材槽位
  - 目标：让页面不只靠文字成立。
  - 素材槽位：
    - 工具截图
    - pricing 摘要
    - feature / limitation 表
    - workflow 图
    - prompt 示例
    - before / after 示例
  - 验收标准：
    - 模板支持“有素材时增强，无素材时降级”
    - 页面可以显式展示具体证据，而不是只口头描述

## P1 - 真实转化资产

- [x] 定义每个 thesis 的 `conversion asset system`
  - 目标：让 CTA 不只是一个按钮，而是有真实承接物。
  - 最低资产类型：
    - checklist
    - template
    - comparison worksheet
    - shortlist PDF / page
    - 咨询 / audit form
  - 验收标准：
    - 每个 thesis 至少有 1 个主资产和 1 个辅助资产
    - 每类页面都知道自己该推哪个资产

- [x] 把转化资产和页面类型绑定
  - 目标：不同页面推不同的 next step，而不是全站只推同一个 prompt pack。
  - 绑定建议：
    - `hub` -> 总入口资产
    - `alternatives` -> shortlist / comparison worksheet
    - `workflow` -> checklist / template
    - `faq` -> 低摩擦 lead magnet
  - 验收标准：
    - CTA 和页面意图一致
    - 不同页面的转化理由明显不同

- [x] 增加真实商业模块
  - 目标：让系统开始具备赚钱能力，而不只是“有 GA4 事件”。
  - 候选模块：
    - affiliate clickout blocks
    - tool shortlist sections
    - lead form / consult CTA
    - sponsored slot / featured tool slot
  - 验收标准：
    - 页面能承载真实商业动作
    - GA4 里能区分 lead、clickout、深度 CTA

## P2

- [x] 建立内容回流机制
  - 目标：把人工修改、排名变化、转化差异反哺到内容规则里。
  - 数据输入：
    - 人工审校结果
    - GSC query 表现
    - GA4 CTA / conversion 表现
    - 页面停留和点击热区代理指标
  - 验收标准：
    - 能回答“什么类型的内容更容易收录 / 转化”
    - 下一轮生成能用上这些反馈

## P3

### P3 优先级顺序

- [ ] `Priority 1`：先做内容资产层 + 自动内容生产
  - 目标：让系统先具备稳定生产高质量内容的能力。
  - 范围：
    - Hermes LLM Wiki 内容资产标准
    - claim / brief / source / asset 卡片
    - research-dossier
    - anti-generic audit
    - 内容生成与回流规则
  - 原则：
    - 页面数不是第一优先级
    - 先解决内容质量，再追求内容规模

- [ ] `Priority 2`：再做真实交付资产
  - 目标：把内容转成真实可领取、可购买、可咨询、可归因的资产。
  - 范围：
    - prompt pack
    - workflow checklist
    - worksheet
    - shortlist
    - consult offer
    - asset delivery flow
  - 原则：
    - 没有真实交付链路，流量价值会被浪费

- [ ] `Priority 3`：最后再继续扩站和扩 thesis
  - 目标：在内容质量和转化闭环被验证后，再扩大页面数、资产数和 thesis 数。
  - 范围：
    - `30 pages + 30 assets`
    - 第二个 thesis 晋升
    - 更深的部署 / SEO / 扩张能力
  - 原则：
    - 扩张以前，必须先证明单 thesis 的收益闭环成立

### P3 - Hermes LLM Wiki 内容资产标准

- [x] 确立 `Hermes LLM Wiki` 为 canonical content asset store
  - 目标：把“可复用知识”和“运行时产物”分开。
  - 规则：
    - `Hermes LLM Wiki` 存主资产
    - repo 里的 `storage/*.json` 和 `public/generated/*.json` 存派生产物
    - 不允许把构建日志、整页 HTML、临时抓取噪音直接写进 Wiki
  - 主从关系：
    - `Wiki` = thesis / cluster / source / claim / page brief / conversion asset / review decision
    - `Pipeline JSON` = source-pack cache / monitoring snapshot / render output / audit output
  - 验收标准：
    - 任意页面都能追溯到一组 Wiki 资产卡
    - 任意运行快照丢失后，仍能从 Wiki 重建内容生成输入

- [x] 定义 7 类 Hermes LLM Wiki 资产卡
  - 目标：让 LLM 读取的是稳定、原子、可复用的卡片，而不是大杂烩文档。
  - 卡片类型：
    - `thesis`
    - `cluster`
    - `source`
    - `claim`
    - `page_brief`
    - `conversion_asset`
    - `review` / `experiment`
  - 原子性要求：
    - 一张卡只表达一类对象
    - 不混放 thesis 定义、原始来源、页面草稿、运营结论
  - 验收标准：
    - 每张卡都能被单独引用
    - 同一张卡可以跨页面、跨轮次复用

- [x] 定义每类卡片的最小 frontmatter schema
  - `thesis`
    - `id`
    - `type`
    - `status`
    - `label`
    - `audience`
    - `problem`
    - `offer`
    - `monetization`
    - `primary_domain`
    - `seed_keywords`
    - `content_assets`
  - `cluster`
    - `id`
    - `type`
    - `thesis_id`
    - `status`
    - `primary_keyword`
    - `support_keywords`
    - `intent_mix`
    - `opportunity_score`
    - `commercial_fit`
    - `source_readiness`
    - `site_slug`
    - `target_pages`
  - `source`
    - `id`
    - `type`
    - `thesis_id`
    - `cluster_id`
    - `source_kind`
    - `title`
    - `url`
    - `domain`
    - `published_at`
    - `captured_at`
    - `freshness_score`
    - `credibility_score`
    - `status`
  - `claim`
    - `id`
    - `type`
    - `thesis_id`
    - `cluster_id`
    - `page_types`
    - `claim_kind`
    - `decision_stage`
    - `confidence`
    - `freshness`
    - `source_ids`
    - `status`
  - `page_brief`
    - `id`
    - `type`
    - `thesis_id`
    - `cluster_id`
    - `page_type`
    - `target_intent`
    - `target_asset`
    - `primary_claim_ids`
    - `secondary_claim_ids`
    - `required_sections`
    - `cta_strategy`
    - `review_priority`
  - `conversion_asset`
    - `id`
    - `type`
    - `thesis_id`
    - `asset_kind`
    - `status`
    - `intent_stage`
    - `delivery_mode`
    - `primary_pages`
    - `conversion_event`
    - `refresh_cycle`
  - `review` / `experiment`
    - `id`
    - `type`
    - `target_id`
    - `target_type`
    - `signal_source`
    - `finding`
    - `decision`
    - `action`
    - `owner`
    - `created_at`
  - 验收标准：
    - LLM 不看正文也能先靠 metadata 过滤出正确卡片
    - 任意 page brief 都能通过 ID 级联到 claim 和 source

- [x] 定义每类卡片的固定正文模板
  - 目标：让 Hermes 和 LLM 对同类资产读取一致。
  - 正文结构要求：
    - `thesis`
      - Thesis summary
      - Audience
      - What it is really about
      - What it is not about
      - Monetization paths
      - Guardrails
    - `cluster`
      - Why this cluster exists
      - Search intents
      - Support page map
      - Competitive gap
      - Conversion path
      - Risks
    - `source`
      - Source summary
      - Key facts extracted
      - Buyer pain signals
      - Caveats
      - Refresh trigger
    - `claim`
      - Claim
      - Why it matters
      - Evidence
      - Counterpoint / limitation
      - Best page types to use this in
      - Refresh condition
    - `page_brief`
      - Page goal
      - Visitor intent
      - Must-win questions
      - Required claims
      - Required examples
      - Required caveats
      - CTA strategy
      - Failure conditions
    - `conversion_asset`
      - Asset promise
      - Who it is for
      - What the visitor receives
      - Why it converts
      - Placement rules
      - Delivery rules
    - `review` / `experiment`
      - What happened
      - Signal observed
      - Why it matters
      - Decision
      - Next run change
  - 验收标准：
    - 同类卡片 heading 顺序固定
    - LLM 可以稳定抽取相同 section

- [x] 规定 Hermes LLM Wiki 目录结构
  - 目标：让资产结构稳定，便于人查和机器读。
  - 建议目录：
    - `wiki/01-theses/`
    - `wiki/02-clusters/`
    - `wiki/03-sources/`
    - `wiki/04-claims/`
    - `wiki/05-page-briefs/`
    - `wiki/06-assets/`
    - `wiki/07-reviews/`
    - `wiki/08-experiments/`
  - 命名规则：
    - `thesis.video-creation.md`
    - `cluster.ai-video-workflow.md`
    - `source.hn-ai-video-workflow-2026-05-02.md`
    - `claim.workflow-review-loop-cost.md`
    - `page-brief.ai-video-workflow.workflow.md`
    - `asset.video-checklist.md`
    - `review.ai-video-workflow.ctr-drop.md`
  - 验收标准：
    - 文件名稳定且可预测
    - 同一资产不会因为展示文案变化而重命名

- [x] 定义 `claim` 为高质量内容生产的核心单位
  - 目标：把页面生成从“写整页文章”改成“选 claim + 排序 + 展示”。
  - `claim_kind` 最低枚举：
    - `definition`
    - `comparison`
    - `pricing`
    - `workflow`
    - `use_case`
    - `failure_mode`
    - `caveat`
    - `recommendation`
    - `conversion`
  - 规则：
    - 每个核心结论必须先变成 claim card
    - claim 必须绑定 `source_ids`
    - claim 必须声明适用页型
  - 验收标准：
    - 新页面生成时优先复用 claim，而不是重新从 source 生全文
    - 人工修改可以沉淀为新 claim 或 claim 修订，而不是只改最终页面

- [x] 定义 `page_brief` 为强页面模板的上游控制面
  - 目标：让模板真正由意图、claim 和 asset 驱动。
  - 规则：
    - 页面必须先有 brief，再有正文
    - brief 必须指定：
      - target intent
      - required claims
      - required examples
      - required caveats
      - CTA strategy
      - internal link role
    - 页型差异优先体现在 brief，不只体现在 HTML 模板
  - 验收标准：
    - `hub / alternatives / workflow / faq / pricing / template-kit` 的 brief 明显不同
    - 没有 brief 的页面不能进入最终发布链路

- [x] 定义 `conversion_asset` 为真实转化资产主对象
  - 目标：把“CTA 文案”升级为“可交付、可测量、可复用的资产定义”。
  - `asset_kind` 最低枚举：
    - `checklist`
    - `worksheet`
    - `template_pack`
    - `shortlist`
    - `consult_offer`
    - `newsletter`
    - `partner_clickout`
  - 规则：
    - 每个 thesis 至少 1 个主资产 + 2 个辅助资产
    - 每个资产必须写明：
      - promise
      - delivery mode
      - target pages
      - conversion event
      - refresh cycle
  - 验收标准：
    - 页面推的是 asset card，不是临时 CTA 文案
    - GA4 / 后续商业归因按 asset 粒度可分析

- [x] 规定 pipeline 与 Hermes LLM Wiki 的读写边界
  - 目标：避免 Wiki 和 repo JSON 双写失控。
  - 当前 pipeline 读取：
    - claim
    - page_brief
    - conversion_asset
  - 当前 pipeline 写回：
    - thesis
    - cluster
    - source
    - claim
    - page_brief
    - conversion_asset
    - review
    - experiment
  - pipeline 不写回：
    - 整页 HTML
    - build log
    - 无结构临时文本
  - 规则：
    - `wiki/*` 是 canonical content asset store
    - `public/generated/*` 和 `storage/*` 只存派生产物与运行快照
    - 同 `id` 的 Wiki 卡优先于本轮生成对象
  - 验收标准：
    - 一轮运行后，新增知识写回 Wiki，新增产物写回 repo
    - 不出现同一对象两套 canonical source

### P3 - 高质量内容生产 v3

- [x] 基于 Hermes LLM Wiki 增加 `research-dossier`
  - 目标：在 `source` 卡之上沉淀更适合写作的素材卡。
  - 最低内容：
    - pricing 摘要
    - changelog / 更新时间
    - 社区抱怨
    - use case
    - failure mode
    - competitor positioning
  - 验收标准：
    - LLM 写页面时优先读 dossier / claim，而不是反复读原网页

- [x] 增加 `anti-generic audit`
  - 目标：自动拦住“结构完整但没有信息差”的内容。
  - 最低检查：
    - 泛话检测
    - 重复句检测
    - “AI 味”段落检测
    - 缺少具体例子 / 数字 / 命名对象时打回
  - 验收标准：
    - 自动审计能明确指出是缺 `claim`、缺 `example`，还是缺 `source`
  - 已实现：
    - 页面级 generic / AI-flavor / low-evidence paragraph 统计
    - `workflow / use-cases / alternatives / template-kit` 的结构化缺口审计
    - Gate 2 使用新的 anti-generic 信号参与放行

### P3 - 强页面模板 v3

- [x] 把模板从“内容页”升级成“决策页 / 工具页 / 产品页”
  - 目标：让模板由 page brief 驱动，而不只是靠固定 section 拼接。
  - 最低增强：
    - `hub` 有决策入口和 supporting page rail
    - `alternatives / best-tools` 有 verdict table 和 outbound click blocks
    - `workflow` 有 step cards、input/output、failure points
    - `pricing / free-vs-paid` 有 hidden cost 和 upgrade trigger
    - `template-kit / case-study` 有 asset preview 和 before/after
  - 验收标准：
    - 不同页型不仅结构不同，视觉职责和转化职责也不同
  - 已实现：
    - `useCases -> audience / trigger / workflow / CTA` 结构化卡片
    - `alternatives` 增加 decision paths
    - `workflow` 增加 step meta / asset preview
    - `template-kit / case-study` 增加 asset preview、before/after、delivery flow

### P3 - 真实转化资产系统 v3

- [x] 把 asset 从“按钮文案”升级成“真实可交付对象”
  - 目标：让 conversion asset 成为真正的商业承接单元。
  - 最低交付链路：
    - 表单提交
    - thank-you page
    - 资产交付
    - 事件埋点
    - asset-level performance record
  - 验收标准：
    - 用户真的能拿到东西
    - 每个 asset 都能独立评估转化表现
  - 已实现：
    - 每个 asset 生成 landing page / thank-you page / downloadable markdown
    - 事件链路：`asset_cta_click -> asset_form_submit -> conversion event -> asset_delivery`
    - asset 路径和交付信息进入 dashboard / wiki / artifact index

### P3 - AI Video Workflow 单 thesis 收益验证

- [x] 定义 `Phase 1 revenue validation` 范围
  - 目标：先跑通一个 thesis 的真实收益闭环，再扩第二个 thesis。
  - 范围：
    - `AI Video Workflow`
    - `automiora.com`
    - `1` 个真实可交付的 Prompt / Workflow Pack
    - `1` 条完整转化链路
    - `10-12` 个高意图强页面
    - `10-15` 个可复用 Hermes Wiki 资产卡
  - 验收标准：
    - 文档层明确本阶段目标
    - 实现层按此范围推进，不提前扩第二个 thesis

- [x] 先定义 `10-12` 个高意图页面清单
  - 建议优先顺序：
    - `hub`
    - `alternatives`
    - `workflow`
    - `pricing`
    - `free-vs-paid`
    - `best-tools`
    - `template-kit`
    - `case-study`
    - `use-cases`
    - `faq`
  - 规则：
    - 先做强，不先做满
    - 每页都必须明确绑定一个 asset 和一个 CTA 任务
  - 验收标准：
    - 页面清单可直接对应生成计划和 brief
  - 当前实现：
    - 标准 10 页 cluster 已全部绑定 asset landing CTA
    - Phase 1 dashboard 会直接检查页数和 CTA 路由完整性

- [x] 先定义 `10-15` 个 Hermes Wiki 高复用资产卡
  - 优先资产：
    - prompt pack
    - workflow checklist
    - comparison worksheet
    - shortlist
    - top claims
    - top page briefs
    - top source cards
  - 规则：
    - 资产先围绕高意图页型服务
    - 不做与当前 thesis 无直接关系的泛资产
  - 验收标准：
    - 每个页面都能追溯到一组 asset / claim / brief
  - 当前实现：
    - claim / page brief / conversion asset 已全部导出到 Hermes Wiki
    - `public/generated/wiki-index.json` 和 `public/generated/content-artifacts/*` 可追溯页面来源

- [x] 跑通一条真实转化链路
  - 目标：不是只有 CTA，而是真正形成用户动作闭环。
  - 最低链路：
    - `搜索流量 -> 页面 -> CTA -> 资产页/表单 -> 资产交付/咨询动作 -> 事件回传`
  - 最低事件：
    - CTA click
    - form submit
    - asset delivery
    - affiliate / consult / deep action
  - 验收标准：
    - 至少有一条路径可以被 GA4 或后续归因系统完整观测

- [x] 定义 `Phase 1` 通过条件
  - 满足以下任意一组，视为跑通：
    - 有真实表单提交或咨询信号
    - 有稳定资产下载 / clickout / copy 行为
    - 能明确识别至少 `1` 类高转化页面 + `1` 类高转化资产
  - 验收标准：
    - 后续是否扩到 `30 pages + 30 assets`
    - 后续是否晋升第二个 thesis
    - 都必须以此为前置判断
  - 当前实现：
    - `public/generated/phase1-validation.json`
    - `storage/phase1-validation.md`
    - dashboard 已展示 checklist / acceptance / next moves

- [x] 规定 `Phase 2 expansion trigger`
  - 只有在 Phase 1 跑通后，才进入：
    - `30` 个页面
    - `30` 个 Hermes Wiki 资产
    - 第二个 thesis 晋升
  - 验收标准：
    - 不再以“页面数”作为第一优先级
    - 而以“页面 + 资产 + 转化链路已验证”为扩张前提

## 当前剩余

P1 / P2 已闭环，当前进入 `P3`：

- 先把 `Hermes LLM Wiki` 内容资产标准落地
- 先把 `Asset Acceptance Gate` 工程化
- 再让高质量内容、强页面模板、真实转化资产都围绕这套资产卡工作
- 并先围绕 `AI Video Workflow / automiora.com` 跑通单 thesis 收益验证

然后再继续这些工程化增强：

- [x] 接真实部署适配器
  - 已补 `release:prod + release:health + seo:diagnostics + seo:submit + worker:d1:migrate`
  - live 发布仍依赖当前终端可用的 `CLOUDFLARE_API_TOKEN`
- [x] 接真实 SEO 提交适配器
  - 已补 GSC sitemap submit + IndexNow adapter + submission state store
  - live submit 仍依赖 `GSC_SITE_URL / Google auth / INDEXNOW_KEY`
- [x] 扩大 source-pack 数据深度
  - 已补 `product / video / relatedQueries / qualitySummary / coverageSummary / source-refresh-queue`
- [x] 增加 richer 商业承接
  - 已补真表单字段、邮件交付、归因、lifecycle、token expiry、resend delivery

### P3 - 四个工程化缺口

这四块不是同优先级并列推进，建议顺序是：

1. `source-pack` 数据深度
2. richer 商业承接 backend
3. 真实 SEO 提交 adapter
4. 真实部署 adapter 收尾

原因：

- 当前发布链路已经能跑
- 当前真正卡收益的是证据层和商业承接层还不够深

#### P3-A. 扩大 source-pack 数据深度

- [x] 接更深的社区 / 产品 / 内容数据源
  - 范围：
    - `X`
    - `Reddit`
    - `YouTube transcript`
    - `Product Hunt`
    - `G2 / Capterra`
    - `PAA / related searches / autosuggest`
  - 目标：
    - 让 source-pack 不再过度依赖单次 search 结果
    - 让页面能稳定拿到真实抱怨、失败模式、替代方案和购买信号
  - 验收标准：
    - 任意重点页都能覆盖 `official / competitive / community / serp` 四层来源
  - 当前实现：
    - 已补 `product / video / relatedQueries`

- [x] 给 source-pack 增加 source scoring / dedupe / freshness
  - 目标：
    - 让系统知道“哪些来源更可信、哪些内容过期、哪些说法冲突”
  - 最低能力：
    - credibility score
    - freshness score
    - duplicate cluster
    - conflict flag
  - 验收标准：
    - 不是只输出 URL 列表，而是输出有优先级的证据包

- [x] 增加 source-pack refresh scheduler
  - 目标：
    - 让内容刷新基于证据变动，而不是只靠定时重跑
  - 触发建议：
    - pricing / changelog 更新
    - 新评论 / 新 complaint
    - GSC impression 上升但 CTR 低
  - 验收标准：
    - refresh 后 source-pack 会新增有效证据，而不是重复旧材料

#### P3-B. 增加 richer 商业承接 backend

- [x] 接真实邮件发送层
  - 候选：
    - `Resend`
    - `SES`
    - `Postmark`
  - 目标：
    - lead 提交后不仅入库，还能真正发交付邮件 / 跟进邮件
  - 验收标准：
    - asset delivery 和 consult acknowledgement 都能真实发信

- [x] 增加 lead attribution 字段
  - 最低字段：
    - `utm_source`
    - `utm_medium`
    - `utm_campaign`
    - `first_touch`
    - `last_touch`
    - `referrer`
    - `cta_variant`
  - 验收标准：
    - 能追溯 page -> CTA -> asset -> lead

- [x] 建 lead lifecycle / follow-up 阶段
  - 最低阶段：
    - `new`
    - `contacted`
    - `qualified`
    - `won`
    - `lost`
  - 目标：
    - 区分测试事件、真实 lead、已跟进 lead、成交信号
  - 验收标准：
    - 后端不再只记录 submit，而能记录商业进度

- [x] 增加 asset delivery policy
  - 范围：
    - 版本管理
    - token 过期
    - 重复领取
    - resend delivery
  - 验收标准：
    - 资产交付从“可下载”升级到“可运营”

#### P3-C. 接真实 SEO 提交适配器

- [x] 建 live SEO submit adapter
  - 范围：
    - `Bing Webmaster`
    - `IndexNow`
    - Google 侧的可自动处理接口或状态同步
  - 目标：
    - 让“SEO 提交”从静态文件生成升级成真实提交动作
  - 验收标准：
    - 至少有一条 live submit 链路可以稳定运行

- [x] 建 SEO submission state store
  - 最低字段：
    - `url`
    - `engine`
    - `submitted_at`
    - `status`
    - `retry_count`
    - `last_error`
  - 验收标准：
    - 能回答哪些 URL 已提交、失败、重试中、被暂停

- [x] 增加 SEO diagnostic checks
  - 范围：
    - canonical
    - robots
    - sitemap inclusion
    - internal links
    - schema presence
  - 验收标准：
    - SEO adapter 不只是“发出去”，还能解释为什么没起量

#### P3-D. 强化真实部署适配器

- [x] 让 pipeline 按 gate 自动调用 release adapter
  - 目标：
    - 通过 Gate 2 的站点自动进入真实发布链路
    - 未通过的继续 preview-only
  - 验收标准：
    - 发布动作不再完全依赖手工触发 `release:prod`

- [x] 增加 staging -> production / rollback / health checks
  - 目标：
    - 让部署不是“一把梭”，而是有晋升和回退
  - 验收标准：
    - 失败发布能自动停住，并给出回滚或重试动作

- [ ] 增加域名 / redirect / env 的 API 化管理
  - 目标：
    - 减少 Cloudflare 控制台手工步骤
  - 验收标准：
    - 至少 `www -> apex` 和核心域名绑定能脚本化完成
  - 当前状态：
    - redirect / release health / production smoke 已脚本化
    - Cloudflare 控制台层的域名与 env API 化仍未做

## 下一轮执行清单

这部分不是历史归档，而是接下来继续推进时默认按顺序执行的清单。

原则：

- 先补 asset gate
- 先补强内容和资产
- 再验证 SEO 曝光
- 再补真实商业承接
- 最后才扩第二个 thesis 和更多站点

### Wave 0 - Asset Acceptance Gate

- [x] 建立 `asset acceptance schema`
  - 目标：让 asset 放行不再靠口头规则。
  - 最低字段：
    - `acceptanceMode`
    - `acceptanceStatus`
    - `failedChecks`
    - `rewriteInstructions`
    - `acceptedBy`
    - `acceptedAt`
    - `writebackRequired`
  - 验收标准：
    - `conversion_asset` 和 pipeline report 都能看到 asset 验收状态

- [x] 建立自动化 asset gate
  - 目标：先让系统判断“能不能工作”，再判断“要不要人工看”。
  - 首批检查：
    - job clarity
    - role clarity
    - input / output clarity
    - first-run usability
    - example density
    - failure visibility
    - promise / delivery match
    - next-step continuity
  - 验收标准：
    - 至少能输出 pass / fail
    - 至少能输出失败项和定向 rewrite instruction

- [x] 建立 A / B / C 三档放行模式
  - 目标：把“是否需要人工”变成明确策略，而不是临时判断。
  - 规则：
    - A 类：自动直发候选
    - B 类：人工快审
    - C 类：人工强审
  - 验收标准：
    - 不同 asset kind 有默认验收路径
    - review queue 只把 B / C 类送给人工

- [x] 建立 asset-level review queue
  - 目标：让人工只看高风险资产，不看所有资产。
  - 最低输出：
    - review mode
    - failed checks
    - reviewer prompt
    - accept / rewrite / escalate 三种动作
  - 验收标准：
    - 人工动作集中在高风险资产
    - 不再默认逐段人工润色

- [x] 建立 asset acceptance -> Wiki writeback 闭环
  - 目标：让已验证资产成为下一轮优先复用对象。
  - 需要回写：
    - acceptance mode
    - strongest use case
    - best page types
    - conversion quality note
    - refresh priority
  - 验收标准：
    - 已通过资产的下一轮复用优先级更高

### Wave 1 - 资产本体继续升级

- [x] 升级 `workflow-checklist` 下载内容本体
  - 目标：让 checklist 从“结构完整”升级成“拿来就能工作”。
  - 需要补：
    - 更具体的适用场景
    - 更明确的 first 30 minutes 动作
    - 更强的 owner / success metric / failure point 表达
    - 更清晰的 second-run / handoff 说明
  - 验收标准：
    - 下载后的 markdown 不需要用户自己补太多上下文
    - thank-you 页和 landing 页的承接理由更强

- [x] 升级 `comparison-worksheet` 下载内容本体
  - 目标：让 worksheet 真正能支撑“买哪个 / 先试哪个”的决策。
  - 需要补：
    - 更明确的评分维度定义
    - 更明确的 first choice / fallback / reject 理由记录
    - hidden cost / upgrade trigger / review drag 的记录区
    - 更具体的 shortlist 示例
  - 验收标准：
    - worksheet 不只是一个空表，而是真能指导比较动作
    - 配套 landing / thank-you 文案也同步增强

- [x] 统一 3 个 asset 的“产品页标准”
  - 范围：
    - `prompt-pack`
    - `workflow-checklist`
    - `comparison-worksheet`
  - 标准：
    - why now
    - workflow fit
    - what gets unlocked
    - first 30 minutes
    - companion pages
  - 验收标准：
    - 三个 asset 的 landing / thank-you / markdown 结构保持同一产品标准

### Wave 2 - 高意图页型内容 refresh 机制

- [x] 给 `workflow` 页增加 refresh 规则
  - 目标：当 source / claim / asset 更新时，关键 workflow 段落能自动重写。
  - 优先刷新：
    - step explanation
    - failure points
    - asset preview
    - example scenario
  - 验收标准：
    - workflow 页不再是一次性生成产物

- [x] 给 `pricing` / `free-vs-paid` 页增加 refresh 规则
  - 目标：随着 pricing source、community signal、ROI signal 变化，关键段可自动增强。
  - 优先刷新：
    - visible price anchor
    - hidden cost
    - upgrade trigger
    - business-proof sentence
  - 验收标准：
    - 价格与商业判断相关段落能持续变新

- [x] 给 `case-study` 页升级真实 intervention 结构
  - 目标：让 case-study 更像可信操作记录，而不是摘要页。
  - 需要补：
    - before state
    - intervention detail
    - what changed in review
    - reusable artifact created
  - 验收标准：
    - case-study 页有更强的“做过这件事”的感觉

- [x] 给 `template-kit` 页继续补强 kit-as-product 逻辑
  - 目标：让它更明确承担“资产总入口”职责。
  - 需要补：
    - asset ordering logic
    - kit selection path
    - deeper internal linking to each asset page
  - 验收标准：
    - template-kit 不只是资产目录，而是 kit 级产品页

### Wave 3 - SEO 曝光验证

- [x] 建立 `title / description / entry visual` 优化清单
  - 优先页：
    - `index`
    - `workflow`
    - `pricing`
    - `free-vs-paid`
    - `template-kit`
  - 目标：
    - 让页面更值得被点击
    - 让后续 CTR 优化有记录可追
  - 验收标准：
    - 至少产出一轮明确的 SEO 文案优化记录

- [x] 建立索引 / entry-page 诊断清单
  - 目标：明确哪些页面应该承担真实入口职责。
  - 需要检查：
    - robots
    - canonical
    - sitemap
    - internal linking
    - indexable page set
  - 验收标准：
    - 诊断结果落盘
    - 下一轮优化动作可直接引用

- [x] 建立 “high impression low CTR / low impression” 两类优化队列
  - 目标：让 Gate 3 输出真正驱动内容与 SEO 修改。
  - 队列类型：
    - `CTR optimization queue`
    - `visibility / indexing queue`
  - 验收标准：
    - 不同问题的页面进入不同优化路径

### Wave 4 - 真实商业承接

- [x] 增加 `consult / audit offer` 样板
  - 目标：让系统开始有比下载更深的商业动作。
  - 最低形态：
    - consult CTA
    - audit request form
    - thank-you / follow-up copy
  - 验收标准：
    - 商业动作不再只有 asset download

- [x] 区分“低摩擦 lead magnet”和“高意图商业动作”
  - 目标：让 GA4 里不同事件代表不同商业含义。
  - 需要区分：
    - download
    - deeper lead
    - clickout
    - consult interest
  - 验收标准：
    - asset conversion 不再全部混在一起解释

- [x] 建立 asset-level 表现比较视图
  - 目标：回答哪个 asset 更值得继续做大。
  - 最低输出：
    - page -> asset 路径
    - submit rate
    - delivery rate
    - deeper action rate
  - 验收标准：
    - 至少能识别 `1` 个更强 asset 和 `1` 个更强 page -> asset path

### Wave 5 - Hermes Wiki 深化

- [x] 给 `claim` 增加表现与复用优先级
  - 目标：让 claim 不只是存档，而是可排序的内容资产。
  - 需要补：
    - reuse priority
    - performance note
    - stale / active decision
  - 验收标准：
    - 下一轮生成可以优先使用更强 claim

- [x] 给 `conversion_asset` 增加资产表现字段
  - 目标：让 asset card 能承载真实商业判断。
  - 需要补：
    - best page types
    - strongest use case
    - conversion quality note
    - refresh priority
  - 验收标准：
    - asset 优化能优先回写到 Wiki，而不是只改 HTML

- [x] 做一次 `page optimization -> wiki writeback` 闭环
  - 目标：证明优化不是停留在页面层。
  - 最低闭环：
    - 优化一个高意图页
    - 回写到 claim / brief / asset
    - 下一轮生成自动复用
  - 验收标准：
    - 确认 Wiki-first 不是纸面规则

### Wave 6 - 扩张前置条件

- [x] 定义 `Phase 2 expansion trigger`
  - 目标：明确什么时候才允许扩到更多页面 / 更多 asset / 第二个 thesis。
  - 进入条件至少包括：
    - 单 thesis 有真实曝光迹象
    - 至少有 1 类内容资产表现更强
    - 至少有 1 条更深商业动作路径
  - 验收标准：
    - 扩张以前先验证收益闭环，不再以页面数优先

## 建议默认起手顺序

如果下一轮直接开工，建议严格按这个顺序：

1. `asset acceptance schema`
2. 自动化 asset gate
3. A / B / C 三档放行模式 + asset review queue
4. `workflow-checklist` 资产升级
5. `comparison-worksheet` 资产升级
6. `workflow / pricing / free-vs-paid / case-study` refresh 机制
7. 关键页 title / description / entry visual 优化
8. 索引 / entry-page 诊断
9. consult / audit offer
10. Wiki writeback 闭环
11. Phase 2 expansion trigger

## 当前不建议优先做的事

在上面这些完成前，不建议优先做：

- [ ] 扩第二个 thesis
- [ ] 新增多个域名
- [ ] 把页面数先扩到 `30`
- [ ] 再补新的自动化节点但不提升流量和收益能力
