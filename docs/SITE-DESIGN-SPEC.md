# Trend Site Pipeline Site Design Spec

> 状态：`v1`
> 适用范围：所有 thesis 站点、核心内容页、资产页、thank-you 页、delivery 页
> 角色：这份文档是 `站点生成 + 视觉收敛 + 设计质检` 的 source of truth

## 1. 这份文档解决什么问题

这份 spec 用来避免下面这些情况反复出现：

- 页面像结构化研究输出，不像真人团队写给用户的页面
- 首页第一屏有信息，但说服力不够强
- 资产页和下载物能交付，但不够像真人会用的东西
- 文案有重复和机械感，商业动作不够自然
- hero、asset cover、CTA、section style 各做各的，最终观感像 demo

这份 spec 不只是“审美建议”，而是：

1. 生成站点时要遵守的设计约束
2. 发布前要执行的质检规则
3. 后续自动化 design profile 的默认输入

---

## 2. 默认设计定位

### 2.1 站点气质

默认气质不是“创意营销页”，也不是“学术研究页”，而是：

`research-backed AI ops product`

也就是：

- 看起来可信、冷静、专业
- 信息密度高，但不压人
- 有证据感，但不学术
- 有商业感，但不油
- 像真人团队做给 operator / buyer / lead 的决策站点

### 2.2 不要做成什么

默认禁止以下风格：

- 未来感 AI 炫光海报页
- 紫蓝渐变主导的泛 SaaS 风
- 过度卡片化、像作品集的营销页
- 纯文字研究备忘录
- 抽象机器人 / 电路板 / 大脑图当主视觉
- 用生成图冒充证据

---

## 3. 全站通用设计语法

这一层是所有 thesis 共享的母体规则。

### 3.1 版式

- 页面内层宽度：`1040px - 1120px` 区间
- 内容带与内容带之间必须有明显节奏，不要所有 section 一个样
- section 采用整带布局，内部内容再做约束，不把整页堆成一摞小卡片
- 卡片只用于：
  - proof block
  - workflow step
  - comparison row summary
  - asset preview
  - CTA module
- 不做卡片套卡片

### 3.2 节奏

- 首屏必须先完成价值建立，不要一上来就长导航 + 长导语
- 页面前 `2` 屏必须回答：
  - 这页给谁
  - 要帮用户做什么判断
  - 为什么可信
  - 下一步做什么
- 高价值页必须遵守：
  - `verdict -> proof -> action`
  - 不是 `背景 -> 背景 -> 背景 -> 最后才 CTA`

### 3.3 字体与层级

- 字体：`Inter, system-ui, sans-serif`
- H1：
  - desktop `48-56px`
  - mobile `34-40px`
- H2：
  - desktop `28-32px`
  - mobile `24-28px`
- body：
  - `16-18px`
  - `line-height 1.65 - 1.75`
- eyebrow / meta label：
  - `12-13px`
  - uppercase 只用于少量标签，不要全页到处吼

### 3.4 组件形态

- 圆角：`8px` 以内
- card / module padding：`18-24px`
- border 优先于重阴影
- 不使用厚重发光效果
- primary CTA 要比 secondary CTA 明显，但不能像广告横幅
- table / proof strip / checklist preview 要看起来像工具面，而不是装饰面

### 3.5 颜色

默认不是单色系，也不要主打紫蓝。

推荐母体色盘：

- base background：深石墨 / charcoal
- surface：略亮于背景的冷深灰
- text：暖白
- muted text：中性灰米
- primary accent：sage / moss green
- secondary accent：muted gold / brass
- error or warning：低饱和 rust / amber

规则：

- 一个 thesis 允许有一组主 accent，但全站不能被单一色相淹没
- 绿和金主要承担“状态 / 重点 / CTA 层级”，不是满屏涂色
- 不做大面积渐变背景，不做装饰性光斑

---

## 4. Thesis Design Profile 合同

后续每个 thesis 都应该有一个轻量 design profile。最少字段如下：

| 字段 | 说明 |
|------|------|
| `thesisKey` | thesis 唯一标识 |
| `brandPositioning` | 一句话定位 |
| `audience` | 主要受众 |
| `primaryOutcome` | 用户想拿到的结果 |
| `proofObjects` | 最值得展示的证据对象 |
| `primaryCtaType` | 主 CTA 类型 |
| `secondaryCtaType` | 次 CTA 类型 |
| `visualMotifs` | 允许出现的视觉母题 |
| `forbiddenMotifs` | 禁止出现的视觉母题 |
| `accentColor` | thesis 的轻量 accent |
| `tone` | 文案语气 |

### 4.1 当前 `automiora / ai-video-workflow` 默认 profile

| 字段 | 当前默认值 |
|------|------------|
| `brandPositioning` | AI workflow decision and execution layer for short-form product content |
| `audience` | indie hackers, product marketers, content operators, small teams |
| `primaryOutcome` | turn scattered tools and prompts into a repeatable launch workflow |
| `proofObjects` | workflow steps, comparison matrix, asset preview, ROI note, failure modes |
| `primaryCtaType` | downloadable workflow asset |
| `secondaryCtaType` | consult / audit |
| `visualMotifs` | workflow board, storyboard, prompt notes, review checklist, screen-to-video scenes |
| `forbiddenMotifs` | abstract AI brain, neon circuit board, generic robot, decorative floating orbs |
| `tone` | calm, operator-first, direct, evidence-backed |

---

## 5. 首页规格

首页不是 thesis 档案入口，而是转化首页。

### 5.1 首屏必须具备

1. `Outcome headline`
2. `Who it's for / not for`
3. `1-2` 条强 proof
4. 主 CTA
5. 次 CTA
6. 一个真实 preview

### 5.2 首页首屏结构

推荐结构：

1. eyebrow：thesis 归属或工作流场景
2. headline：一句话讲结果，不讲过程
3. support copy：适用对象 + 触发场景
4. proof strip：数字、命名工具、资产数量、workflow step、failure mode
5. CTA row：
   - 主 CTA：拿资产
   - 次 CTA：看 workflow / 申请 audit
6. hero preview：
   - workflow board
   - checklist preview
   - comparison snapshot
   - before/after sequence

### 5.3 首页首屏禁止项

- 空泛 thesis 描述
- “我们做了一个系统”式自我介绍
- 只有漂亮图，没有 proof
- CTA 只有一个模糊按钮
- hero 视觉和正文没有关系

---

## 6. 高价值页规格

以下页型默认纳入高价值页：

- `index / hub`
- `alternatives`
- `pricing`
- `free-vs-paid`
- `workflow`
- `template-kit`
- `case-study`

### 6.1 通用要求

每个高价值页在前 `2` 屏内必须出现：

- verdict
- audience / fit
- proof
- watch-out
- next step

### 6.2 页型规则

#### `alternatives`

- 第一屏就要出现建议顺序，不要先铺背景
- 要像 shortlist page，不像百科页
- comparison table 下面必须给“谁先看哪个、谁跳过哪个”
- CTA 应该接 worksheet / shortlist / consult

#### `pricing`

- 要回答“什么时候值得付费”，不是只列 plan
- 必须出现 upgrade trigger
- 必须出现 hidden cost / review cost / team cost
- CTA 应该接 buying worksheet / audit，而不是泛下载

#### `free-vs-paid`

- 重点是 upgrade boundary，不是产品宣传
- 必须明确 free 什么时候够用，什么时候会卡住
- 要给出一个典型“从 free 升 paid”的真实工作流断点

#### `workflow`

- 要像 operator playbook
- 每一步必须有 input / output / owner / failure mode
- 必须有第一轮 pilot 和 repeat-run 差异
- CTA 应该接 checklist / template

#### `template-kit`

- 不是介绍“我们有资源包”，而是展示资源包如何被用
- 必须展示 asset inventory
- 必须展示 first-run example
- 必须展示 repeat-run example
- CTA 前要明确“谁现在就该拿”

#### `case-study`

- 要有 before / after
- 要有 decision change
- 要有 what worked / what failed / what changed
- CTA 应该顺着案例走到 consult 或 template kit

---

## 7. 资产页与交付页规格

### 7.1 资产 landing page

必须回答：

1. 这份资产解决什么具体动作
2. 适合谁
3. 什么时候用
4. 包含什么
5. 打开后怎么开始

必须具备：

- 资产 inventory
- 使用前提
- blank preview
- filled example
- watch-out
- time-to-value 说明

### 7.2 thank-you / delivery page

不是“谢谢下载”，而是：

- 立即交付入口
- 下一步怎么用
- 推荐先打开哪一页
- 如果用户想更快推进，还有什么高意图动作

### 7.3 真实感标准

一个资产如果要通过设计层质检，至少要让人感觉：

- 这不是泛模板
- 这是做过真实工作后整理出来的
- 今天就能拿去填、拿去改、拿去执行

---

## 8. 视觉资产规格

### 8.1 优先级

视觉证据优先级：

1. 真实截图 / 真实界面
2. 真实工作物 preview
3. AI 生成但紧贴 workflow 的辅助视觉
4. fallback poster

说明：

- 生成图只能增强氛围或补充场景，不应该冒充证据
- hero 图要服务 headline 和 CTA，不是独立海报
- asset cover 要看起来像工作物封面，不像装饰 poster

### 8.2 允许的视觉母题

- workflow board
- storyboard frames
- review notes
- comparison sheet
- prompt snippets
- screen-to-video scenes
- operator desk / planning surface

### 8.3 禁止的视觉母题

- 机器人
- 发光脑图
- 电路线条抽象背景
- 与 thesis 无关的人像氛围图
- 无法解释具体页面用途的纯装饰图

### 8.4 一致性要求

以下元素必须看起来来自同一产品：

- 首页 hero
- workflow / use-cases / template-kit / case-study hero
- prompt-pack / worksheet / checklist cover
- thank-you page preview
- social preview / OG image

---

## 9. 文案与转化语气规格

### 9.1 文案目标

文案要像：

- 团队里最靠谱的 operator 在帮用户省判断时间

不要像：

- 系统在解释自己多完整
- 研究员在交内部总结
- 通用 AI 文案器在写长句

### 9.2 必须遵守

- 先给判断，再给依据
- 先给用户任务，再给方法解释
- CTA 像自然下一步，不像插播广告
- 不重复同一类 verdict 句型
- 不滥用“comprehensive / powerful / seamless / unlock / leverage”这类空词

### 9.3 机械感高的常见信号

- 多段都在重复“this page helps”
- 每个 section 都是相同开场
- CTA 全部像“download now”
- 长段落只是在换词重复 thesis
- 没有命名对象、数字、失败模式

---

## 10. 设计质检规则

这部分是 release 前的必检项。

### 10.1 首页 Gate

首页必须全部通过：

- [ ] `5` 秒内能看懂给谁、解决什么、下一步是什么
- [ ] 首屏存在主 CTA 和次 CTA
- [ ] 首屏存在 proof，而不只是主张
- [ ] hero preview 与 thesis 强相关
- [ ] 首屏文案没有明显研究稿腔

### 10.2 高价值页 Gate

每个高价值页至少通过这些项：

- [ ] 前 `2` 屏内有 verdict
- [ ] 有 audience / fit
- [ ] 有至少一个 watch-out / failure mode
- [ ] CTA 与页型意图匹配
- [ ] 段落不是机械复用

### 10.3 资产 Gate

每个核心资产至少通过：

- [ ] 打开后 `3` 分钟内可开始使用
- [ ] 有 blank preview
- [ ] 有 filled example
- [ ] 有 watch-out
- [ ] CTA 承诺和交付一致

### 10.4 视觉 Gate

- [ ] 首页 hero 不是 fallback 级占位感
- [ ] 核心页 hero 风格一致
- [ ] 核心 asset cover 风格一致
- [ ] 没有页面明显像 demo，另一些像正式站
- [ ] CTA / card / proof block / table 的层级语言一致

### 10.5 发布前最低放行线

如果下面任一项不满足，不建议视为“可打版本”：

- 首页 Gate 未全过
- 高价值页里有 `2` 个以上仍明显像研究备忘录
- 核心资产没有 filled example
- 首页或核心资产页仍主要依赖 fallback 视觉
- 整体视觉完成度明显割裂

---

## 11. 执行方法

### 11.1 生成前

先确认 thesis design profile：

- audience
- outcome
- proof objects
- CTA path
- visual motifs
- forbidden motifs

### 11.2 生成时

站点生成、页面改写、图片生成都要以这份 spec 为约束，尤其是：

- headline 和首屏结构
- 高价值页叙事顺序
- CTA 分层
- asset preview 结构
- visual prompts

### 11.3 生成后

按这份 spec 做人工快审或自动化审查。

推荐做法：

1. 先看首页 Gate
2. 再看高价值页 Gate
3. 再看资产 Gate
4. 最后看视觉 Gate

如果要记录审查结果，使用：

- [`storage/design-review.template.json`](/Users/max/code/trend-site-mvp/storage/design-review.template.json)

---

## 12. 后续工程化建议

这份 spec 后续应当进一步工程化成两个输入：

1. `globalDesignProfile`
   - 所有 thesis 共用
2. `thesisDesignProfile`
   - 每个 thesis 单独覆盖

后续代码层建议把它们显式接到：

- page recipe
- hero renderer
- asset cover generator
- copy rewrite pass
- review queue / release gate

在代码正式接入前，这份文档就是当前最上游的执行标准。
