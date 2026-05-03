# Trend Site Pipeline Asset Acceptance Gate

这份文档定义一件事：

`conversion asset` 生成出来以后，什么时候可以直接交付，什么时候必须人工快审，什么时候必须强审。

目标不是追求“零人工”，而是：

`用最小人工成本，稳定产出可转化资产`

---

## 1. 为什么需要这道 Gate

页面内容和转化资产不是一回事。

页面只要满足：

- 结构完整
- 证据足够
- 可收录

就可以进入发布判断。

但资产还要额外满足：

- promise 站得住
- 用户下载后 10 分钟内能开始用
- 用户用完后自然进入下一步动作
- CTA 承诺和真实交付一致

所以系统不能默认：

`AI 生成 asset = 可直接放行`

更合理的默认规则是：

`AI 负责生成 80-90% 主体，人只做高杠杆验收`

---

## 2. 资产来源模型

资产不是从“CTA 文案”长出来的，而是从这几类上游对象组合出来的：

1. `source-pack`
   - 官网、文档、pricing、changelog、workflow guide、community signal
2. `research-dossier`
   - pricing anchor、use case、failure mode、competitor positioning
3. `claim`
   - definition、comparison、pricing、workflow、failure_mode、recommendation、conversion
4. `page brief`
   - target intent、required claims、CTA strategy、target asset
5. `conversion_asset`
   - promise、delivery mode、target pages、conversion event、refresh cycle

也就是说，asset 的生成逻辑应该是：

`搜索意图 + 工作流摩擦点 + 真实证据 + 可交付格式 + 转化目标`

而不是：

`AI 凭空写一个下载物`

---

## 3. 系统原则

### 3.1 默认原则

- 自动化负责生成资产主干
- 人工不负责重写整份资产
- 人工只负责做高价值验收
- 验收不通过时，优先打回 AI 定向重写
- 通过后的修订必须优先回写到 Wiki 资产层

### 3.2 核心判断标准

每个 asset 都必须回答：

1. 什么时候用
2. 谁来用
3. 输入是什么
4. 输出是什么
5. 用完后下一步做什么

如果只回答“是什么”和“为什么”，那它更像内容附赠物，不像真实交付物。

### 3.3 交付设计原则

比起“写得像人”，更重要的是“长得像工作件”。

因此优先做这些特征：

- 可勾选
- 可填写
- 可评分
- 可交接
- 可复用
- 有示例
- 有失败点
- 有 second-run / handoff 说明

---

## 4. 三类资产放行模式

### 4.1 A 类：可自动直发候选

适用：

- `checklist`
- `worksheet`
- `shortlist`
- 简单 SOP

默认要求：

- 结构完整
- 输入/输出明确
- first 30 minutes 明确
- failure point 明确
- 至少有一个 filled example
- 没有强 ROI 承诺
- 没有“最佳选择”类强背书

放行模式：

- 自动 gate 通过后可直接交付
- 抽样人工 spot-check

### 4.2 B 类：人工快审后放行

适用：

- `prompt-pack`
- `template_pack`
- pricing / comparison 相关下载物
- 带推荐顺序的 shortlist

默认要求：

- 自动 gate 必须先过
- 再做一次 `3-5` 分钟人工快审

人工快审只看三件事：

1. 这个东西我会不会发给同事直接用
2. 里面有没有一句明显说过头的话
3. 第一次试跑时会不会卡住

### 4.3 C 类：必须人工强审

适用：

- `consult_offer`
- `partner_clickout`
- affiliate 推荐资产
- 带明确 ROI / 节省成本 / 最佳选择承诺的资产

默认要求：

- 自动 gate 通过
- 人工强审通过
- 必要时补人工 evidence note

原因：

这类资产一旦判断失真，损失的是信任和商业解释力，不只是内容质量。

---

## 5. 自动验收标准

自动化先做第一层放行，重点不是判断“像不像人”，而是判断“能不能工作”。

每个 asset 至少要过这 8 项：

1. `job clarity`
   - 是否解决一个明确动作，而不是泛主题
2. `role clarity`
   - 是否明确 who it is for
3. `input/output clarity`
   - 是否写明输入、输出、完成定义
4. `first-run usability`
   - 用户下载后 10 分钟内是否能开始
5. `example density`
   - 是否至少有一个填好的示例或演示块
6. `failure visibility`
   - 是否包含 failure point / watch-out / reject condition
7. `promise-delivery match`
   - CTA 承诺与下载内容是否一致
8. `next-step continuity`
   - 用户完成后是否知道下一步动作

建议后续把这 8 项固化成 `assetAcceptance` 评分对象：

- `jobClarityScore`
- `roleClarityScore`
- `ioClarityScore`
- `firstRunScore`
- `exampleScore`
- `failureModeScore`
- `promiseMatchScore`
- `nextStepScore`

最低建议：

- 总分 `>= 70` 才允许进入发布候选
- 单项关键分不能为 `0`

关键分包括：

- `jobClarityScore`
- `firstRunScore`
- `promiseMatchScore`

---

## 6. 最小人工成本验收

这个系统不该把人力花在逐段润色上，而该花在：

- 放行判断
- 风险定位
- 商业承诺校正

因此推荐的人工成本模型是：

### 6.1 默认人工投入

- A 类资产：`0-1` 分钟抽检
- B 类资产：`3-5` 分钟快审
- C 类资产：`5-10` 分钟强审

### 6.2 人工动作最小化原则

不允许默认进入：

- 人手重写整份 asset
- 人手补所有例子
- 人手修所有表达问题

优先进入：

1. 标记失败项
2. 生成定向 rewrite instruction
3. 只在必要时人工改最后一小块
4. 把最终版本回写到 Wiki

### 6.3 人工快审清单

人工快审默认只回答 5 个问题：

1. 这个资产解决的是不是一个明确动作
2. 用户下载后 10 分钟内能不能开始用
3. 有没有至少一个具体示例或填好的样例
4. 有没有明确 failure point / watch-out
5. CTA 承诺和实际交付是不是一致

任意一项不通过：

- 不直接人工重写
- 先打回生成层补齐

---

## 7. 三类核心资产的升级标准

这是当前最优先的三类资产。

### 7.1 workflow-checklist

目标：

从“说明流程”升级成“团队 SOP”。

必须具备：

- step
- owner
- input
- output
- done definition
- failure sign
- fallback action
- handoff note
- second-run refinement

通过标准：

- 团队成员拿到后不需要先回页面补上下文
- 可以直接拿来跑第一次试点

### 7.2 comparison-worksheet

目标：

从“比较提纲”升级成“选型决策表”。

必须具备：

- scoring dimensions
- `1 / 3 / 5` 分定义
- weight
- must-have
- disqualifier
- hidden cost 区
- review drag 区
- first choice / fallback / reject reason
- 一个 filled shortlist example

通过标准：

- 下载后可以直接做第一次 shortlist 判断
- 能输出明确的 first choice 和 fallback

### 7.3 prompt-pack

目标：

从“提示词合集”升级成“第一轮执行包”。

必须具备：

- brief intake block
- prompt grouped by use case
- variables / placeholders
- expected output shape
- common bad output -> repair prompt
- reviewer rubric
- reuse note
- second-run improvement note

通过标准：

- 第一轮试跑不需要用户自己从零组织需求
- 执行后能沉淀出下一轮可复用输入

---

## 8. 失败后的系统动作

资产未通过 gate 时，不要只记一个 pass/fail。

至少要记：

- `failed_checks`
- `rewrite_instructions`
- `review_mode`
- `accepted_by`
- `accepted_at`
- `writeback_required`

推荐失败原因枚举：

- `missing_example`
- `weak_first_run`
- `weak_input_output`
- `promise_mismatch`
- `generic_advice`
- `weak_handoff`
- `overclaim_risk`
- `missing_next_step`

---

## 9. Wiki 回写要求

验收通过后，资产层不能只留在 HTML 或下载文件里。

至少要回写到 `conversion_asset` 卡：

- acceptance mode
- acceptance status
- accepted version
- strongest use case
- best page types
- conversion quality note
- refresh priority
- last human review note

目标是让后续生成优先复用“已证明可交付”的资产，而不是重复生成未验证版本。

---

## 10. 当前到下一步的开发计划

下一步不应该继续优先堆页面，而应该先把资产放行系统补齐。

推荐顺序：

1. 建立 `asset acceptance schema`
   - 为 `conversion_asset` 增加 acceptance 字段
   - 为 pipeline-report 增加 asset acceptance 输出
2. 建立自动 gate
   - 先覆盖 checklist / worksheet / prompt-pack
   - 输出 pass/fail + failed checks + rewrite instructions
3. 建立人工快审队列
   - 只把 B / C 类资产送入 queue
   - A 类资产只做抽检
4. 升级三类核心资产本体
   - `workflow-checklist`
   - `comparison-worksheet`
   - `prompt-pack`
5. 建立 asset-level performance writeback
   - 把 download / delivery / deeper action 回写到 Wiki
6. 再做更深商业动作
   - `consult_offer`
   - `audit_offer`
   - 更深 clickout / affiliate path

一句话总结：

`先把 asset 变成能交付的工作件，再把它们变成能转化的商业件。`
