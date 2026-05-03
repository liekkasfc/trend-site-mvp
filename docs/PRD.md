# Trend Site Pipeline PRD

> 状态提示（2026-05-03）：当前系统最新完成度、缺口判断和执行顺序，请优先看 [CURRENT-GAPS-V2.md](/Users/max/code/trend-site-mvp/docs/CURRENT-GAPS-V2.md)。本文件更适合看产品定义、目标形态和历史阶段描述。

## 1. 文档信息

- 产品名称：`Trend Site Pipeline`
- 当前阶段：`MVP / Operator-facing internal product`
- 当前版本：`P1 + P2 已闭环，P3 标准已定义`
- 文档目的：
  - 统一产品描述
  - 统一目标用户和价值主张
  - 统一当前能力边界与后续方向

## 2. 产品一句话

`Trend Site Pipeline` 是一套面向专题站 / 趋势站运营者的自动化增长系统：以自动建站为外壳、以自动内容生产为核心、以真实交付资产为终点，把“热词发现”一路推进到“内容生成、页面构建、SEO、监控、优化”，并逐步向无人值守运行靠拢。

## 3. 产品短描述

### 3.1 30 秒描述

这是一个把趋势发现、关键词验证、站点路由、内容生产、页面生成、质量审核、SEO 提交和数据监控串起来的自动化流水线。它不是一个通用 CMS，而是一个为“围绕 thesis 批量做专题站”设计的建站操作系统。

更准确地说，它不是“先建站、顺便生成内容”，而是“先把内容生产系统做对，再用建站系统把内容放大”。

### 3.2 适合对外介绍的版本

`Trend Site Pipeline` 帮独立开发者、内容运营者和小型 SEO 团队，把一个值得做的趋势主题，快速变成一个有结构、有证据、有转化承接的专题站。系统会先判断热词该并入哪个 thesis、该不该建站，再自动生成页面、审核质量、接入 GSC/GA4 监控，并用历史反馈持续优化下一轮内容。

### 3.3 更完整的产品描述

多数趋势站、工具站或 niche site 的问题，不是“没有想法”，而是从想法到真正上线之间链路太长：要找词、判断值不值得做、搭站、写内容、做 SEO、挂监控、看数据，再不断补内容和调标题。`Trend Site Pipeline` 的目标，就是把这条链路尽量产品化和自动化。

与传统“抓词 + 批量生成页面”的工具不同，它加入了三层关键判断：

1. `热词 -> thesis -> 域名` 路由层
2. `证据驱动内容生成`，而不是单纯模板填空
3. `反馈 -> playbook -> 下一轮生成` 的回流闭环

这使它更像一个专题站增长引擎，而不是单次页面生成器。

### 3.4 核心定义

本产品的主次关系是：

- `自动建站` 是框架
- `自动内容生产` 是核心能力
- `真实交付资产` 是商业终点

因此，产品价值不在于“能自动生成很多页面”，而在于：

`能持续生产有质量的内容 -> 带来流量 -> 从内容沉淀为真实交付资产 -> 形成可追踪转化`

## 4. 背景与机会

### 4.1 行业背景

围绕 AI、新工具、新工作流的搜索流量持续存在，但传统内容站通常有几个痛点：

- 热词发现分散在多个平台
- 关键词值不值得做，常靠人工判断
- 页面能上线，但内容不够有信息差
- SEO 和转化资产是两个割裂系统
- 数据监控和内容更新之间没有闭环

### 4.2 机会判断

如果能把以下链路打通，就能显著降低做专题站的时间成本：

`热词发现 -> 机会判断 -> 站点路由 -> 证据沉淀 -> 页面生成 -> 发布审核 -> SEO 与监控 -> 下一轮优化`

这也是本产品的核心机会。

## 5. 产品目标

### 5.1 核心目标

1. 让一个 thesis 能稳定地产出结构化专题站
2. 把“建站”从一次性动作变成持续迭代的系统
3. 用真实信号而不是纯模板生成来驱动内容质量
4. 让内容、页面和转化资产能被复用
5. 最终朝“低人工、可放大、可监控”的运行形态演进

### 5.2 当前阶段目标

当前阶段不是追求完全替代人工，而是：

- 先把主链路跑通
- 先让系统具备较稳定的内容结构和审核标准
- 先让 GSC + GA4 真数据进入优化判断
- 先搭好后续 `Hermes LLM Wiki` 内容资产层的标准
- 先定义 `Asset Acceptance Gate`，让资产生成和资产放行分开

### 5.3 非目标

当前产品不以这些为目标：

- 通用博客 CMS
- 完整外链自动化平台
- 面向普通编辑的低门槛写作工具
- 完全替代人工内容判断的“全自动赚钱机器”

## 6. 目标用户

### 6.1 核心用户

1. `独立开发者 / Indie hacker`
   - 想围绕某个 thesis 快速建站，测试流量与变现

2. `内容运营 / SEO operator`
   - 需要批量评估机会、生成内容、监控表现

3. `小型 niche site studio`
   - 希望一人或几人管理多个专题站

### 6.2 用户共性

- 愿意接受 AI 辅助，但不希望只得到空泛内容
- 关注速度，也关注“能不能收录、能不能转化”
- 不想从零手工搭每个站
- 需要可追踪、可复盘、可扩展的流程

## 7. 用户问题

当前产品解决的不是单点问题，而是一组连续问题：

1. 这个热词值得做吗？
2. 这个热词应该并入现有站，还是值得新开 thesis？
3. 我能不能用更少人力先做出一版有竞争力的结构？
4. 页面上线后，我怎么知道该扩、该优还是该停？
5. 哪些内容资产、CTA 和页型真的有价值？

## 8. 产品价值主张

`Trend Site Pipeline` 的核心价值，不是“生成页面”，而是：

### 8.1 统一全链路

把原本分散的热词发现、建站、内容、SEO、监控、优化，合并成一条产品化流程。

### 8.2 让 thesis 成为管理单位

系统不按“单个关键词”思考，而按 `thesis` 管理：

- 机会是否属于这个 thesis
- 是否应并入现有域名
- 是否值得晋升成独立站

### 8.3 让证据成为内容上游

通过 `source-pack -> facts -> page model -> HTML`，让内容尽量建立在结构化证据上，而不是只靠提示词硬写。

### 8.4 让反馈进入下一轮生成

通过 `content-feedback + content-playbook`，系统不是只生成，而是能基于历史表现自我调参。

### 8.5 为转化资产预留产品位

每个 thesis、每类页面都能绑定 conversion asset，为后续真实商业化打底。

### 8.6 用最小人工成本交付可转化资产

本产品不把“完全无人验证”当成默认目标，而把：

`自动生成主干 + 最小人工成本验收 + 持续回写复用`

当成真实可落地的资产交付策略。

## 9. 产品形态

当前产品由三层组成：

### 9.1 Operator Console

前端控制台，用于查看：

- 全链路 11 个阶段状态
- 路由结果
- 生成站点
- Gate 1 / Gate 2 / Gate 3
- review queue
- feedback / playbook

### 9.2 Pipeline Engine

脚本驱动的自动化引擎，负责：

- 发现热词
- 验证筛选
- 聚类与 thesis 路由
- 生成 source-pack / facts / pages
- 质量审核
- 监控与优化建议

### 9.3 Generated Site Layer

输出静态页面与内容产物：

- `public/generated-sites/*`
- `public/generated/content-artifacts/*`

## 10. 核心工作流

完整链路：

`热词发现 -> 验证筛选 -> 关键词聚类 -> 内容生成 -> 页面构建 -> 质量审核 -> 部署上线 -> SEO提交 -> 数据监控 -> 排名/转化优化 -> 淘汰/扩展`

中间关键的一层是：

`热词 -> thesis -> 域名`

系统会先判断热词应该：

- `append_existing`
- `create_candidate`
- `reject_or_watch`

这个设计的价值在于，系统不会因为“一个词过关”就盲目新建站。

## 11. 当前核心能力

### 11.1 机会判断

- Gate 1 已建立
- 支持趋势连续性、商业意图、支持页广度判断
- 支持 thesis 路由和 candidate 晋升

### 11.2 内容生产

- `source-pack -> facts -> page model -> HTML`
- 10 页标准 cluster
- 支持 evidence-driven 内容生成
- 支持 manual review override

### 11.3 页面模板

已支持页型：

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

### 11.4 审核与发布

- Gate 2 自动审核
- 审核维度包括 facts、verdicts、examples、traceability、intent completeness
- 未过关页面自动 `noindex`
- `conversion asset` 不默认因为“已生成”就直接视为可交付
- 资产需经过独立 `Asset Acceptance Gate` 判断放行模式

### 11.5 监控与优化

- Gate 3 优先接真实 `GSC + GA4`
- 支持 ranking / conversion signals
- 生成 optimization actions
- 生成 lifecycle 决策

### 11.6 反馈回流

- review queue
- content feedback
- content playbook
- 下一轮生成自动读取 playbook

## 12. 当前能力边界

当前系统虽然已经像一个产品，但边界也很明确：

### 12.1 已经能做的

- 自动跑通专题站主链路
- 生成结构化、多页型站点
- 接入真实排名和转化信号
- 让系统根据历史反馈提高下一轮内容标准

### 12.2 还不能稳定做好的

- 持续产出真正一流的高质量内容
- 真实部署到多个生产 provider
- 自动做高质量 SEO 提交
- 无人工参与的高可信转化资产放行
- 自动化获取真实外链

## 13. 当前默认 thesis 与样板

### 13.1 Active thesis

- `AI Video Workflow`
- 域名：`automiora.com`
- 面向：
  - indie hackers
  - product marketers
  - content operators
- 当前 offer：
  - tool comparisons
  - workflow guides
  - reusable prompt pack

### 13.2 Candidate thesis

- `AI Agent Infrastructure`
- 还未晋升成 active site
- 用来验证第二个 thesis 的路由和扩张能力

## 14. 核心用户场景

### 场景 1：运营者每周找新机会

用户希望知道：

- 本周哪些热词值得做
- 应该并入哪个 thesis
- 是否需要新开站

### 场景 2：围绕一个 thesis 批量建支持页

用户希望系统直接产出：

- hub
- alternatives
- workflow
- pricing
- template kit

并且结构尽量像真实专题站，而不是单页 demo。

### 场景 3：上线后根据真实信号判断下一步

用户希望知道：

- 是继续扩
- 还是先改标题与描述
- 还是先排查索引
- 还是暂停投入

### 场景 4：未来把内容资产沉淀进 Hermes LLM Wiki

用户希望：

- 把 thesis / cluster / claim / asset 变成可复用卡片
- 让页面生成不再依赖一次性的 JSON 快照
- 让后续内容生产、模板升级和转化资产围绕统一资产库工作

## 15. 关键产物

当前产品的核心输出包括：

- `public/generated/pipeline-report.json`
  - 控制台主数据源
- `public/generated-sites/*`
  - 生成站点
- `public/generated/content-artifacts/*`
  - source-pack、facts、artifact index
- `storage/pipeline-history.json`
  - 运行历史
- `storage/decision-log.md`
  - 关口决策
- `storage/review-queue.json`
  - 人工 spot-check 队列
- `storage/content-feedback.json`
  - 内容反馈
- `storage/content-playbook.json`
  - 下一轮生成规则

## 16. 成功指标

### 16.1 产品层指标

- 单个 thesis 从发现到上线的时间
- 单轮 pipeline 可稳定生成的站点数
- 页型覆盖率
- 自动审核通过率

### 16.2 SEO 层指标

- impressions
- clicks
- CTR
- top-50 / top-20 关键词数
- indexed page ratio

### 16.3 商业层指标

- CTA click
- form submit
- asset download
- affiliate clickout
- conversion rate

### 16.4 系统层指标

- review queue 长度
- override 使用频率
- content-playbook 对下一轮内容的改善幅度
- source 复用率 / claim 复用率

## 17. 风险与挑战

当前最大的风险不是代码，而是产品层面这几件事：

1. `内容质量`
   - 自动化可以做出结构，未必做得出真正有优势的内容

2. `数据源稳定性`
   - 社区源、搜索源和外部抓取结果可能波动

3. `商业承接不足`
   - CTA 和 asset 体系现在有框架，但还不够真实

4. `资产放行标准尚未工程化`
   - 资产本体、验收模式和人工成本控制已经有规范，但还没完全固化成系统 gate

5. `生产部署未闭环`
   - 本地和生成层已稳定，生产部署 adapter 还需继续补

6. `资产主库尚未落地`
   - `P3` 的 Hermes LLM Wiki 适配标准已定义，但资产层还未真正接入

## 18. 产品路线图

### 已完成

- `P1`
  - 证据驱动内容生成
  - 10 页标准 cluster
  - 转化资产基础系统
- `P2`
  - 内容反馈回流
  - content playbook

### 当前重点

- `P3`
  - 定义并接入 `Hermes LLM Wiki` 内容资产标准
  - 把高质量内容、强页面模板、真实转化资产都升级到资产驱动模式
  - 把 `Asset Acceptance Gate` 工程化，形成“自动生成 + 最小人工成本验收”的资产放行系统

### 后续工程化方向

- 真实部署 adapter
- 真实 SEO 提交 adapter
- 更深的数据源接入
- 真表单、真交付、真转化归因

## 19. 当前优先级与验证策略

当前最重要的，不是继续扩更多 thesis，也不是先把页面数做大，而是先验证：

`单个 thesis 能否通过高意图页面 + 内容资产 + 转化资产，跑出可解释的商业信号`

### 19.1 当前主策略

先围绕：

- thesis：`AI Video Workflow`
- 域名：`automiora.com`

做一个可验证收益的单 thesis 样板。

这个阶段的重点不是“规模”，而是：

1. 页面能不能稳定获取目标流量
2. 资产能不能被点击、下载、复制或咨询
3. 内容资产能不能在多页之间复用
4. 用户是否会顺着 CTA 进入真实转化路径

### 19.2 为什么不先扩第二个 thesis

当前系统已经证明：

- 可以发现机会
- 可以做 thesis 路由
- 可以生成结构化页面
- 可以接 GSC / GA4

但还没有真正证明：

- 哪类内容资产最能转化
- 哪类 CTA 最有效
- 哪种页面组合最值得扩
- 哪种交付物真的有人要

因此，现阶段先扩第二个 thesis 的价值，不如先把一个 thesis 的“收益闭环”跑通。

### 19.3 Phase 1 Revenue Validation Spec

#### 目标

先做出一个最小但真实的商业验证闭环。

#### 范围

- `1` 个 active thesis
- `1` 个真实可交付的 Prompt / Workflow Pack
- `1` 条完整转化链路
- `10-12` 个高意图强页面
- `10-15` 个可复用 Hermes Wiki 资产卡

#### 页面范围建议

优先覆盖这些高意图页型：

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

核心原则：

- 先做强，不先做满
- 先做能承接转化的页，不先铺低价值页

#### 资产范围建议

优先沉淀这些高复用资产：

- prompt pack
- workflow checklist
- comparison worksheet
- shortlist
- 关键 claim cards
- 关键 page briefs
- 关键 source cards

#### 必须跑通的用户路径

至少要有一条真实路径成立：

`搜索流量 -> 页面 -> CTA -> 资产页 / 表单 -> 资产交付 / 咨询动作 -> 事件回传`

#### 本阶段通过标准

满足以下任意一组，视为 Phase 1 跑通：

1. 有真实表单提交或咨询信号
2. 有稳定资产下载 / clickout / copy 行为
3. 能明确识别至少 1 类高转化页面 + 1 类高转化资产

#### 本阶段不追求

- 一上来做 `30 pages + 30 assets`
- 同时开第二个 active thesis
- 复杂外链自动化
- 大规模社媒分发

### 19.4 Phase 2 Expansion Trigger

只有在 Phase 1 跑通后，才进入：

- `30` 个页面
- `30` 个 Hermes Wiki 资产
- 第二个 thesis 晋升

进入 Phase 2 的前提是：

1. 至少 1 个资产链路有真实转化信号
2. 至少 1 组页面组合表现稳定
3. 内容资产库已经足以支撑重复生成，而不是继续靠临时拼装

### 19.5 这对 P3 的意义

因此，`P3` 的本质不是“继续加功能”，而是把产品从：

`自动建站引擎`

升级成：

`可验证收益的自动增长引擎`

## 20. 附录：可直接复用的产品介绍文案

### 20.1 一句话

`Trend Site Pipeline` 是一套把趋势发现、专题站生成、SEO 监控和内容优化串成闭环的自动化建站系统。

### 20.2 适合发给合作方的版本

我们在做的是一个围绕 thesis 运营专题站的自动化引擎。它会先判断一个热词应不应该做、该并到哪个站，再自动生成有证据支撑的页面结构，接入 GSC/GA4 监控，并用历史反馈持续优化下一轮内容。

### 20.3 适合写在项目首页的版本

Build thesis-driven trend sites with a structured pipeline from opportunity discovery to content, SEO, monitoring, and feedback-driven iteration.
