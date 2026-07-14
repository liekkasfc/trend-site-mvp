# Automiora Signal First Pass — 小分发草稿

> 日期：2026-07-14  
> 目标：不扩站，用最小外部分发验证**真实点击 + 资产动作**  
> 主链：内容页 → 资产/offer（`/prompt-pack/`、`/comparison-worksheet/`、`/workflow-checklist/`、`/audit/`）  
> 成功口径：非自测点击、资产 landing 到达、form submit / delivery（不看 forecast revenue）

## 1. 推荐链接（按帖子类型）

| 帖子类型 | 首选落地 | 备选 |
|----------|----------|------|
| 工作流/失败修复 | `https://automiora.com/workflow/` | CTA → Comparison Worksheet |
| 工具 shortlist | `https://automiora.com/compare/` | CTA → Workflow Checklist |
| 成本/升级 | `https://automiora.com/pricing/` 或 `/free-vs-paid/` | CTA → Prompt Pack |
| 直接要资产 | `https://automiora.com/prompt-pack/` | — |
| 卡住要人工 | `https://automiora.com/audit/` | — |

UTM 建议（便于 GA4 拆）：

```
?utm_source=x&utm_medium=social&utm_campaign=signal_first_2026_07
?utm_source=reddit&utm_medium=community&utm_campaign=signal_first_2026_07
?utm_source=indiehackers&utm_medium=community&utm_campaign=signal_first_2026_07
?utm_source=outreach&utm_medium=email&utm_campaign=signal_first_2026_07
```

---

## 2. X 帖（1 条）

**角度：** 第一刀失败通常不是模型，是流程。

```
Most AI video “workflow” posts skip the only thing that matters:

Which shot failed, and who owns the repair?

We run a 5-step pilot for short product demos:
1) one use case
2) one source asset
3) Runway first / Pika fallback
4) repair the broken 5–8s shot
5) hand off an asset, not a folder of generations

If you’re shipping feature demos this week:
https://automiora.com/workflow/?utm_source=x&utm_medium=social&utm_campaign=signal_first_2026_07
```

**可选图注：** workflow 页 hero 或 5 failure cards 截图。

**发出后 24h 记录：** impressions / link clicks / prompt-pack or worksheet visits。

---

## 3. Reddit 或 IndieHackers（二选一，1 条）

### 3A. Reddit（r/SaaS / r/ProductManagement / r/aivideo — 选最匹配的一个）

**Title：**
```
How we stop AI product demo videos from burning credits on the first pass
```

**Body：**
```
Context: indie/SaaS teams trying to turn screenshots or UI into a 15–20s product demo.

What kept failing for us:
- one prompt doing hook + product action + CTA
- no owner for the broken shot
- “compare 6 tools” before a measurable pilot

What we do instead (one afternoon pilot):
1. Lock one publish goal (homepage/feature demo)
2. Shortlist: Runway first, Pika only as fallback
3. Name the failure mode (generic / subject drift / flat motion / weak CTA / credit burn)
4. Repair that shot only
5. Save notes so run #2 doesn’t restart from blank

Writeup with the 5-step flow + failure repairs:
https://automiora.com/workflow/?utm_source=reddit&utm_medium=community&utm_campaign=signal_first_2026_07

If useful: free Comparison Worksheet to score primary vs fallback before opening another tab.
Not selling a course — looking for “what breaks in your stack?” feedback.
```

**合规：** 先有实质内容，链接一次，回复优先答问题；避免纯推广语气。

### 3B. IndieHackers（若更偏 builder 受众）

**Title：**
```
Shipping short AI product demos without turning it into a model beauty contest
```

**Body：**
```
Building in public: Automiora is a decision site for short-form AI video workflows (not another “top 50 tools” list).

Lesson so far:
The expensive part isn’t generation — it’s review + unowned failures.

We documented a 5-step pilot:
Runway first → Pika fallback → repair one 5–8s shot → asset handoff.

https://automiora.com/workflow/?utm_source=indiehackers&utm_medium=community&utm_campaign=signal_first_2026_07

Curious: if you’ve shipped AI demo clips, what actually blocked you — model quality, credits, or review loop?
```

---

## 4. 定向 outreach（5–10 条）

### 人选（优先级）

1. 最近在 X/Reddit 抱怨 “AI video workflow / product demo / screenshot to video” 的 indie hacker  
2. 做 SaaS launch 的 solopreneur（需要 feature demo）  
3. 代理/小团队做 product marketing 的内容负责人  
4. 已下载过类似 prompt pack 的人（若有名单）  
5. 个人网络里正在做 AI 内容试点的人  

### 短邮件 / DM 模板

**Subject / opener：**
```
Quick question on your AI product demo workflow
```

**Body：**
```
Hey {name} —

Saw you’re shipping {product / launch}. We’ve been documenting a tight pilot for short product demos:

• Runway first, Pika only as fallback  
• repair one broken 5–8s shot before switching models  
• hand off notes so the second run isn’t blank  

Would a 5-step workflow writeup be useful, or are you already past that?

https://automiora.com/workflow/?utm_source=outreach&utm_medium=email&utm_campaign=signal_first_2026_07

If you already have a stack: what’s the real bottleneck — credits, continuity, or review?

— {you}
```

**跟进（3 天，若有点击无回复）：**
```
If useful, the free Prompt Pack is the “first 30 minutes” version of the same pilot:
https://automiora.com/prompt-pack/?utm_source=outreach&utm_medium=email&utm_campaign=signal_first_2026_07

No pitch deck — just trying to see if the failure modes match what you hit.
```

### Outreach 追踪表（复制到表格）

| # | 人/渠道 | 发出日 | 链接 | 打开/点 | 资产动作 | 备注 |
|---|--------|--------|------|---------|----------|------|
| 1 | | | workflow | | | |
| 2 | | | workflow | | | |
| 3 | | | compare | | | |
| 4 | | | prompt-pack | | | |
| 5 | | | free-vs-paid | | | |
| 6–10 | | | | | | |

---

## 5. 发出后 48–72h 只看这些指标

| 指标 | 来源 | 目标（弱信号也算） |
|------|------|-------------------|
| 落地页 sessions | GA4 | > 自测基线 |
| 带 UTM 的 sessions | GA4 | 能归因到 x/reddit/ih/outreach |
| asset_cta_click | GA4 | ≥1 非自测 |
| asset_form_submit / delivery | GA4 + ops | ≥1 更理想 |
| GSC clicks | GSC | 可仍为 0；分发不指望 SEO 立刻起 |

**不要看：** pipeline forecast revenue、modeled rates。

---

## 6. 执行清单

- [ ] 发 1 条 X  
- [ ] 发 1 条 Reddit **或** IndieHackers  
- [ ] 发出 5–10 条 outreach  
- [ ] 24h / 72h 填追踪表  
- [ ] 把结果写回 `SIGNAL-BASELINE.md` § 分发复测  

相关：`SIGNAL-FIRST-PASS.md` WP3、`SIGNAL-BASELINE.md`
