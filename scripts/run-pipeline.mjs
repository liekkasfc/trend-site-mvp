import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

if (typeof process.loadEnvFile === 'function') {
  const dotEnvPath = path.join(process.cwd(), '.env')
  if (existsSync(dotEnvPath)) {
    process.loadEnvFile(dotEnvPath)
  }
}

const { buildSiteVisualAssets } = await import('./site-visuals.mjs')

const projectRoot = process.cwd()
const publicDir = path.join(projectRoot, 'public')
const generatedDir = path.join(publicDir, 'generated')
const artifactsDir = path.join(generatedDir, 'content-artifacts')
const sitesRoot = path.join(publicDir, 'generated-sites')
const storageDir = path.join(projectRoot, 'storage')
const wikiRoot = path.join(projectRoot, 'wiki')
const historyPath = path.join(storageDir, 'pipeline-history.json')
const decisionLogPath = path.join(storageDir, 'decision-log.md')
const reviewQueuePath = path.join(storageDir, 'review-queue.json')
const reviewQueueMarkdownPath = path.join(storageDir, 'review-queue.md')
const assetReviewQueuePath = path.join(storageDir, 'asset-review-queue.json')
const assetReviewQueueMarkdownPath = path.join(storageDir, 'asset-review-queue.md')
const reviewOverridesPath = path.join(storageDir, 'review-overrides.json')
const reviewOverridesTemplatePath = path.join(storageDir, 'review-overrides.template.json')
const feedbackPath = path.join(storageDir, 'content-feedback.json')
const contentPlaybookPath = path.join(storageDir, 'content-playbook.json')
const experimentPath = path.join(projectRoot, 'config', 'experiment.json')
const thesisRegistryPath = path.join(projectRoot, 'config', 'thesis-registry.json')
const routingRulesPath = path.join(projectRoot, 'config', 'routing-rules.json')
const experiment = JSON.parse(await readFile(experimentPath, 'utf8'))
const thesisRegistryConfig = JSON.parse(await readFile(thesisRegistryPath, 'utf8'))
const routingRules = JSON.parse(await readFile(routingRulesPath, 'utf8'))
const execFileAsync = promisify(execFile)

const config = {
  runId: new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
  generatedAt: new Date().toISOString(),
  baseUrl: process.env.SITE_BASE_URL ?? 'http://localhost:4173',
  minOpportunityScore: 62,
  minCommercialFit: 58,
  maxDiscoveredTopics: 12,
  maxSitesPerRun: experiment.maxSitesPerRun ?? 1,
  monitoringMode: process.env.MONITORING_MODE ?? 'auto',
  thesisKey: experiment.thesisKey,
  autoReleaseEnabled: parseBooleanFlag(process.env.AUTO_RELEASE_ENABLED, false),
  autoReleaseOnGatePass: parseBooleanFlag(process.env.AUTO_RELEASE_ON_GATE_PASS, false),
}

const googleConfig = {
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
  serviceAccountPrivateKey: normalizeServiceAccountPrivateKey(
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '',
  ),
  oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
  oauthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? '',
  oauthTokenUrls: dedupe(
    [
      process.env.GOOGLE_OAUTH_TOKEN_URL ?? '',
      'https://oauth2.googleapis.com/token',
      'https://accounts.google.com/o/oauth2/token',
    ].filter(Boolean),
  ),
  gscSiteUrl: process.env.GSC_SITE_URL ?? '',
  ga4PropertyId: normalizeGa4PropertyId(process.env.GA4_PROPERTY_ID ?? ''),
  ga4MeasurementId: (process.env.GA4_MEASUREMENT_ID ?? '').trim(),
  ga4ConversionEvents: dedupe(
    (process.env.GA4_CONVERSION_EVENTS ?? 'generate_lead,sign_up,purchase')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
  gscLookbackDays: parsePositiveInt(process.env.GSC_LOOKBACK_DAYS, 30),
  ga4LookbackDays: parsePositiveInt(process.env.GA4_LOOKBACK_DAYS, 30),
}

const contentConfig = {
  unattendedMode: parseBooleanFlag(process.env.UNATTENDED_MODE, true),
  reviewMode: (process.env.CONTENT_REVIEW_MODE ?? 'unattended').trim() || 'unattended',
  aiProvider: (process.env.CONTENT_AI_PROVIDER ?? 'heuristic').trim() || 'heuristic',
  aiEndpoint: (process.env.CONTENT_AI_ENDPOINT ?? '').trim(),
  aiApiKey: (process.env.CONTENT_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim(),
  aiModel: (process.env.CONTENT_AI_MODEL ?? '').trim(),
  sourceResultLimit: parsePositiveInt(process.env.CONTENT_SOURCE_RESULT_LIMIT, 4),
  pageCountTarget: parsePositiveInt(process.env.CONTENT_PAGE_COUNT_TARGET, 10),
}

const firecrawlConfig = {
  enabled: parseBooleanFlag(process.env.FIRECRAWL_ENABLED, false),
  bin: (process.env.FIRECRAWL_CLI_BIN ?? 'firecrawl').trim() || 'firecrawl',
  apiKey: (process.env.FIRECRAWL_API_KEY ?? '').trim(),
  apiUrl: (process.env.FIRECRAWL_API_URL ?? '').trim(),
  timeoutMs: parsePositiveInt(process.env.FIRECRAWL_TIMEOUT_MS, 120000),
  searchLimit: parsePositiveInt(process.env.FIRECRAWL_SEARCH_LIMIT, 8),
  mapLimit: parsePositiveInt(process.env.FIRECRAWL_MAP_LIMIT, 18),
  deepPageLimit: parsePositiveInt(process.env.FIRECRAWL_DEEP_PAGE_LIMIT, 6),
  excerptChars: parsePositiveInt(process.env.FIRECRAWL_EXCERPT_CHARS, 1200),
  waitForMs: parsePositiveInt(process.env.FIRECRAWL_WAIT_FOR_MS, 1500),
  agentEnabled: parseBooleanFlag(process.env.FIRECRAWL_AGENT_ENABLED, false),
  agentModel: (process.env.FIRECRAWL_AGENT_MODEL ?? 'spark-1-mini').trim() || 'spark-1-mini',
  agentMaxCredits: parsePositiveInt(process.env.FIRECRAWL_AGENT_MAX_CREDITS, 80),
}

const deliveryConfig = {
  apiBaseUrl: trimTrailingSlash(process.env.DELIVERY_API_BASE_URL ?? ''),
  turnstileSiteKey: (process.env.TURNSTILE_SITE_KEY ?? '').trim(),
  turnstileRequired: parseBooleanFlag(process.env.TURNSTILE_REQUIRED, false),
}
deliveryConfig.enabled = Boolean(deliveryConfig.apiBaseUrl)

const googleTokenCache = new Map()
const searchResultCache = new Map()
const firecrawlCommandCache = new Map()
const firecrawlMapCache = new Map()
const firecrawlScrapeCache = new Map()
const firecrawlAgentCache = new Map()

const browserSearchHeaders = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://duckduckgo.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 TrendSitePipeline/1.0',
}

const communityDomains = new Set([
  'reddit.com',
  'news.ycombinator.com',
  'quora.com',
  'stackoverflow.com',
  'community.openai.com',
])

const researchNoiseDomains = [
  'medium.com',
  'youtube.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'substack.com',
  'pinterest.com',
]

const developerSourceDomains = [
  'github.com',
  'huggingface.co',
  'gitlab.com',
  'npmjs.com',
  'pypi.org',
]

const comparisonDomains = [
  'g2.com',
  'capterra.com',
  'toolify.ai',
  'futurepedia.io',
  'aitoolnet.com',
  'topai.tools',
  'saashub.com',
  'alternativeto.net',
  'sourceforge.net',
]

const productDomains = [
  'producthunt.com',
  'huggingface.co',
  'replicate.com',
  'fal.ai',
  'runwayml.com',
  'labs.google',
  'klingai.com',
  'openart.ai',
  'pika.art',
  'appsumo.com',
  'github.com',
]

const feedUrl = 'https://trends.google.com/trending/rss?geo=US'

const stageCatalog = [
  ['trend-discovery', '热词发现'],
  ['validation-screening', '验证筛选'],
  ['keyword-clustering', '关键词聚类'],
  ['content-generation', '内容生成'],
  ['page-construction', '页面构建'],
  ['quality-audit', '质量审核'],
  ['deployment', '部署上线'],
  ['seo-submission', 'SEO提交'],
  ['data-monitoring', '数据监控'],
  ['ranking-optimization', '排名/转化优化'],
  ['retirement-expansion', '淘汰/扩展'],
]

const wikiDirectoryMap = {
  theses: path.join(wikiRoot, '01-theses'),
  clusters: path.join(wikiRoot, '02-clusters'),
  sources: path.join(wikiRoot, '03-sources'),
  claims: path.join(wikiRoot, '04-claims'),
  pageBriefs: path.join(wikiRoot, '05-page-briefs'),
  assets: path.join(wikiRoot, '06-assets'),
  reviews: path.join(wikiRoot, '07-reviews'),
  experiments: path.join(wikiRoot, '08-experiments'),
}

const thesisRegistry = normalizeThesisRegistry(thesisRegistryConfig, experiment)
const activeThesisRegistryEntry =
  thesisRegistry.find((entry) => entry.thesisKey === experiment.thesisKey) ??
  buildFallbackActiveThesisFromExperiment(experiment)
const activeTheses = thesisRegistry.filter((entry) => entry.status === 'active')
const routableTheses = thesisRegistry.filter((entry) =>
  ['active', 'candidate'].includes(entry.status),
)

const themePresets = {
  'agent-infrastructure': {
    label: 'Agent Infrastructure',
    audience: 'builders evaluating model orchestration and agent runtime choices',
    offer: 'agent stack shortlist',
    monetization: ['affiliate', 'template-sale', 'lead-gen'],
    leadMagnet: 'Agent stack evaluation worksheet',
    ctaLabel: 'Get the evaluation worksheet',
    expansionIdeas: [
      'add framework comparison pages',
      'publish benchmark notes',
      'attach implementation templates',
    ],
  },
  'video-creation': {
    label: activeThesisRegistryEntry.label ?? experiment.thesisLabel,
    audience: activeThesisRegistryEntry.audience ?? experiment.targetAudience,
    offer: experiment.offer,
    monetization: activeThesisRegistryEntry.monetization ?? experiment.monetization,
    leadMagnet: experiment.leadMagnet,
    ctaLabel: experiment.ctaLabel,
    expansionIdeas: experiment.expansionIdeas,
  },
  'productivity-ai': {
    label: 'Productivity AI',
    audience: 'operators looking for reliable AI copilots inside recurring workflows',
    offer: 'automation teardown and vendor shortlist',
    monetization: ['affiliate', 'lead-gen', 'newsletter'],
    leadMagnet: 'Ops automation checklist',
    ctaLabel: 'Get the ops checklist',
    expansionIdeas: [
      'add setup walkthroughs',
      'publish pricing comparisons',
      'attach ROI calculator content',
    ],
  },
  'revenue-automation': {
    label: 'Revenue Automation',
    audience: 'growth teams evaluating outbound automation and AI-assisted sales motion',
    offer: 'playbook and vendor shortlist',
    monetization: ['lead-gen', 'affiliate', 'sponsorship'],
    leadMagnet: 'Outbound automation playbook',
    ctaLabel: 'Get the outbound playbook',
    expansionIdeas: [
      'add ICP-specific landing pages',
      'publish sequence templates',
      'attach case study libraries',
    ],
  },
  'general-explainers': {
    label: 'General Explainers',
    audience: 'general searchers who need context before they trust a new tool category',
    offer: 'explainer series',
    monetization: ['newsletter', 'template-sale'],
    leadMagnet: 'Trend explainer digest',
    ctaLabel: 'Join the trend digest',
    expansionIdeas: [
      'add glossary pages',
      'publish use-case examples',
      'bundle FAQ roundups',
    ],
  },
}

const contentRulePresets = {
  hub: {
    targets: { facts: 4, verdicts: 2, examples: 1, refs: 4 },
    introStrategy: 'pain_then_outcome',
    ctaStrategy: 'lead_with_asset',
  },
  alternatives: {
    targets: { facts: 5, verdicts: 4, examples: 2, refs: 5 },
    introStrategy: 'decision_first',
    ctaStrategy: 'comparison_to_asset',
  },
  workflow: {
    targets: { facts: 5, verdicts: 3, examples: 4, refs: 5 },
    introStrategy: 'specific_context',
    ctaStrategy: 'implementation_asset',
  },
  faq: {
    targets: { facts: 3, verdicts: 0, examples: 1, refs: 4 },
    introStrategy: 'specific_context',
    ctaStrategy: 'low_friction_asset',
  },
  'best-tools': {
    targets: { facts: 4, verdicts: 4, examples: 1, refs: 4 },
    introStrategy: 'decision_first',
    ctaStrategy: 'comparison_to_asset',
  },
  pricing: {
    targets: { facts: 5, verdicts: 4, examples: 3, refs: 5 },
    introStrategy: 'decision_first',
    ctaStrategy: 'comparison_to_asset',
  },
  'free-vs-paid': {
    targets: { facts: 5, verdicts: 4, examples: 3, refs: 5 },
    introStrategy: 'decision_first',
    ctaStrategy: 'comparison_to_asset',
  },
  'use-cases': {
    targets: { facts: 4, verdicts: 1, examples: 4, refs: 4 },
    introStrategy: 'specific_context',
    ctaStrategy: 'lead_with_asset',
  },
  'template-kit': {
    targets: { facts: 5, verdicts: 3, examples: 4, refs: 5 },
    introStrategy: 'specific_context',
    ctaStrategy: 'implementation_asset',
  },
  'case-study': {
    targets: { facts: 4, verdicts: 1, examples: 3, refs: 4 },
    introStrategy: 'specific_context',
    ctaStrategy: 'implementation_asset',
  },
}

const discoveryPattern = new RegExp(
  buildDiscoveryPatternKeywords(experiment, routableTheses)
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'i',
)

const seedTopics = buildSeedTopics(experiment, routableTheses)
const seedTopicMap = new Map(
  seedTopics.map((topic) => [compactText(String(topic.keyword ?? '').toLowerCase(), 200), topic]),
)
const thesisRuntimeMap = new Map(thesisRegistry.map((entry) => [entry.thesisKey, buildThesisRuntime(entry)]))
if (contentConfig.unattendedMode) {
  config.maxSitesPerRun = Math.max(config.maxSitesPerRun, activeTheses.length)
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleCase(value) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase())
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function dedupe(values) {
  return [...new Set(values)]
}

function dedupeBy(values, key) {
  const seen = new Map()
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    if (value[key] == null) continue
    seen.set(value[key], value)
  }
  return [...seen.values()]
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits))
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBooleanFlag(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function trimTrailingSlash(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

function toPercentString(value) {
  return `${round(value * 100, 1)}%`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function shortHash(value, length = 10) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length)
}

function compactText(value, maxLength = 220) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}...`
}

function normalizeCollection(values) {
  return (values ?? []).filter(Boolean)
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function meaningfulText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulList(values) {
  return safeArray(values)
    .map((value) => meaningfulText(value))
    .filter(Boolean)
}

function preferMeaningfulText(...values) {
  for (const value of values) {
    const normalized = meaningfulText(value)
    if (normalized) return normalized
  }
  return ''
}

function preferMeaningfulList(...lists) {
  for (const list of lists) {
    const normalized = meaningfulList(list)
    if (normalized.length > 0) return dedupe(normalized)
  }
  return []
}

function preferFiniteNumber(...values) {
  for (const value of values) {
    if (value == null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function pickDefined(entries) {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  )
}

function reusePriorityWeight(value) {
  const normalized = meaningfulText(value).toLowerCase()
  if (normalized === 'high') return 16
  if (normalized === 'medium') return 8
  return 2
}

function lifecycleDecisionWeight(value) {
  const normalized = meaningfulText(value).toLowerCase()
  if (normalized === 'active') return 8
  if (normalized === 'watch') return 4
  if (normalized === 'refresh') return 1
  return 0
}

function computeClaimQualityScore(claim) {
  const statementScore = meaningfulText(claim?.statement) ? 24 : 0
  const whyScore = meaningfulText(claim?.whyItMatters) ? 16 : 0
  const evidenceScore = Math.min(meaningfulList(claim?.evidence).length * 8, 24)
  const sourceScore = Math.min(safeArray(claim?.sourceIds).length * 5, 15)
  const pageTypeScore = Math.min(safeArray(claim?.pageTypes).length * 3, 12)
  const confidenceScore = Math.round(clamp(preferFiniteNumber(claim?.confidence, 0) * 10, 0, 9))
  const counterpointScore = meaningfulText(claim?.counterpoint) ? 6 : 0
  const total =
    statementScore +
    whyScore +
    evidenceScore +
    sourceScore +
    pageTypeScore +
    confidenceScore +
    counterpointScore +
    reusePriorityWeight(claim?.reusePriority) +
    lifecycleDecisionWeight(claim?.lifecycleDecision)

  return clamp(Math.round(total), 0, 100)
}

function computePageBriefCompletenessScore(brief) {
  const goalScore = meaningfulText(brief?.pageGoal) ? 22 : 0
  const visitorIntentScore = meaningfulText(brief?.visitorIntent) ? 18 : 0
  const questionScore = Math.min(meaningfulList(brief?.mustWinQuestions).length * 10, 30)
  const sectionScore = Math.min(meaningfulList(brief?.requiredSections).length * 6, 18)
  const failureScore = Math.min(meaningfulList(brief?.failureConditions).length * 4, 8)
  const exampleScore = Math.min(meaningfulList(brief?.requiredExamples).length * 2, 4)
  return clamp(
    Math.round(goalScore + visitorIntentScore + questionScore + sectionScore + failureScore + exampleScore),
    0,
    100,
  )
}

function computeAssetReuseScore(asset) {
  const deliverableCount = safeArray(asset?.deliverables).length
  const primaryPageCount = meaningfulList(asset?.primaryPages).length
  const useCaseCount = meaningfulList(asset?.useCaseLabels).length
  const bestPageCount = meaningfulList(asset?.bestPageTypes).length
  const acceptanceWeight =
    meaningfulText(asset?.acceptanceStatus).toLowerCase() === 'accepted' ||
    meaningfulText(asset?.acceptanceStatus).toLowerCase() === 'human_quick_review'
      ? 18
      : 8
  const reuseScore =
    (meaningfulText(asset?.summary || asset?.promise) ? 22 : 0) +
    Math.min(deliverableCount * 8, 24) +
    Math.min(primaryPageCount * 3, 15) +
    Math.min(useCaseCount * 4, 12) +
    Math.min(bestPageCount * 2, 8) +
    acceptanceWeight +
    reusePriorityWeight(asset?.refreshPriority)

  return clamp(Math.round(reuseScore), 0, 100)
}

function mergeAlignedClaimIds(generatedIds, wikiIds) {
  const generated = preferMeaningfulList(generatedIds)
  const wiki = preferMeaningfulList(wikiIds)
  if (generated.length === 0) return wiki
  const generatedSet = new Set(generated)
  const alignedWiki = wiki.filter((id) => generatedSet.has(id))
  return dedupe([...alignedWiki, ...generated])
}

function mergeClaimCard(generatedClaim, wikiClaim) {
  if (!generatedClaim && !wikiClaim) return null
  const merged = {
    ...(generatedClaim ?? {}),
    ...(wikiClaim ?? {}),
  }
  merged.id = preferMeaningfulText(wikiClaim?.id, generatedClaim?.id)
  merged.type = preferMeaningfulText(wikiClaim?.type, generatedClaim?.type, 'claim')
  merged.thesisId = preferMeaningfulText(wikiClaim?.thesisId, generatedClaim?.thesisId)
  merged.clusterId = preferMeaningfulText(wikiClaim?.clusterId, generatedClaim?.clusterId)
  merged.pageTypes = preferMeaningfulList(wikiClaim?.pageTypes, generatedClaim?.pageTypes)
  merged.claimKind = preferMeaningfulText(wikiClaim?.claimKind, generatedClaim?.claimKind, 'definition')
  merged.decisionStage = preferMeaningfulText(
    wikiClaim?.decisionStage,
    generatedClaim?.decisionStage,
    'discover',
  )
  merged.confidence = preferFiniteNumber(wikiClaim?.confidence, generatedClaim?.confidence, 0.62)
  merged.freshness = preferMeaningfulText(wikiClaim?.freshness, generatedClaim?.freshness, 'manual')
  merged.sourceIds = preferMeaningfulList(wikiClaim?.sourceIds, generatedClaim?.sourceIds)
  merged.status = preferMeaningfulText(wikiClaim?.status, generatedClaim?.status, 'active')
  merged.statement = preferMeaningfulText(wikiClaim?.statement, generatedClaim?.statement)
  merged.whyItMatters = preferMeaningfulText(wikiClaim?.whyItMatters, generatedClaim?.whyItMatters)
  merged.evidence = preferMeaningfulList(wikiClaim?.evidence, generatedClaim?.evidence)
  merged.counterpoint = preferMeaningfulText(wikiClaim?.counterpoint, generatedClaim?.counterpoint)
  merged.bestPageTypes = preferMeaningfulList(wikiClaim?.bestPageTypes, generatedClaim?.bestPageTypes, merged.pageTypes)
  merged.reusePriority = preferMeaningfulText(wikiClaim?.reusePriority, generatedClaim?.reusePriority, 'medium')
  merged.performanceNote = preferMeaningfulText(wikiClaim?.performanceNote, generatedClaim?.performanceNote)
  merged.lifecycleDecision = preferMeaningfulText(
    wikiClaim?.lifecycleDecision,
    generatedClaim?.lifecycleDecision,
    'active',
  )
  merged.refreshCondition = preferMeaningfulText(
    wikiClaim?.refreshCondition,
    generatedClaim?.refreshCondition,
  )
  merged.manualSource = wikiClaim?.manualSource ?? generatedClaim?.manualSource
  merged.qualityScore = computeClaimQualityScore(merged)
  return merged
}

function mergePageBriefCard(generatedBrief, wikiBrief) {
  if (!generatedBrief && !wikiBrief) return null
  const merged = {
    ...(generatedBrief ?? {}),
    ...(wikiBrief ?? {}),
  }
  merged.id = preferMeaningfulText(wikiBrief?.id, generatedBrief?.id)
  merged.type = preferMeaningfulText(wikiBrief?.type, generatedBrief?.type, 'page_brief')
  merged.thesisId = preferMeaningfulText(wikiBrief?.thesisId, generatedBrief?.thesisId)
  merged.clusterId = preferMeaningfulText(wikiBrief?.clusterId, generatedBrief?.clusterId)
  merged.pageType = preferMeaningfulText(wikiBrief?.pageType, generatedBrief?.pageType)
  merged.targetIntent = preferMeaningfulText(wikiBrief?.targetIntent, generatedBrief?.targetIntent)
  merged.targetAsset = preferMeaningfulText(wikiBrief?.targetAsset, generatedBrief?.targetAsset)
  merged.primaryClaimIds = mergeAlignedClaimIds(
    generatedBrief?.primaryClaimIds,
    wikiBrief?.primaryClaimIds,
  )
  merged.secondaryClaimIds = mergeAlignedClaimIds(
    generatedBrief?.secondaryClaimIds,
    wikiBrief?.secondaryClaimIds,
  )
  merged.requiredSections = preferMeaningfulList(wikiBrief?.requiredSections, generatedBrief?.requiredSections)
  merged.ctaStrategy = preferMeaningfulText(wikiBrief?.ctaStrategy, generatedBrief?.ctaStrategy)
  merged.reviewPriority = preferMeaningfulText(wikiBrief?.reviewPriority, generatedBrief?.reviewPriority, 'medium')
  merged.pageGoal = preferMeaningfulText(wikiBrief?.pageGoal, generatedBrief?.pageGoal)
  merged.visitorIntent = preferMeaningfulText(wikiBrief?.visitorIntent, generatedBrief?.visitorIntent)
  merged.mustWinQuestions = preferMeaningfulList(wikiBrief?.mustWinQuestions, generatedBrief?.mustWinQuestions)
  merged.requiredExamples = preferMeaningfulList(wikiBrief?.requiredExamples, generatedBrief?.requiredExamples)
  merged.requiredCaveats = preferMeaningfulList(wikiBrief?.requiredCaveats, generatedBrief?.requiredCaveats)
  merged.failureConditions = preferMeaningfulList(wikiBrief?.failureConditions, generatedBrief?.failureConditions)
  merged.manualSource = wikiBrief?.manualSource ?? generatedBrief?.manualSource
  merged.completenessScore = computePageBriefCompletenessScore(merged)
  return merged
}

function serializeFrontmatterValue(value) {
  if (value == null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function buildFrontmatter(frontmatter) {
  return [
    '---',
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`),
    '---',
    '',
  ].join('\n')
}

function buildMarkdownSections(sections) {
  return safeArray(sections)
    .filter((section) => section?.heading)
    .map((section) => {
      const lines = normalizeCollection(section.lines)
      return [`## ${section.heading}`, '', ...lines].join('\n')
    })
    .join('\n\n')
}

function buildWikiCardMarkdown(frontmatter, sections) {
  return `${buildFrontmatter(frontmatter)}${buildMarkdownSections(sections).trim()}\n`
}

function parseFrontmatterValue(rawValue) {
  const trimmed = String(rawValue ?? '').trim()
  if (!trimmed) return ''

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function parseWikiCardMarkdown(markdown) {
  const normalized = String(markdown ?? '')
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, sections: [], body: normalized }
  }

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return { frontmatter: {}, sections: [], body: normalized }
  }

  const frontmatterBlock = normalized.slice(4, closingIndex)
  const body = normalized.slice(closingIndex + 5)
  const frontmatter = {}

  for (const line of frontmatterBlock.split('\n')) {
    if (!line.trim()) continue
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1)
    frontmatter[key] = parseFrontmatterValue(value)
  }

  const sections = []
  const matches = [...body.matchAll(/^##\s+(.+)\n([\s\S]*?)(?=^##\s+.+\n|$)/gm)]
  for (const match of matches) {
    const heading = match[1]?.trim()
    const content = match[2] ?? ''
    const lines = content
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
    sections.push({ heading, lines })
  }

  return { frontmatter, sections, body }
}

function getWikiSectionLines(sections, heading) {
  return safeArray(sections).find((section) => section.heading === heading)?.lines ?? []
}

function getWikiSectionText(sections, heading) {
  return getWikiSectionLines(sections, heading)
    .map((line) => line.replace(/^- /, '').trim())
    .join(' ')
    .trim()
}

function getWikiSectionList(sections, heading) {
  return getWikiSectionLines(sections, heading)
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean)
}

function normalizeWikiSourceId(value, siteSlug) {
  return String(value ?? '').replace(new RegExp(`^source\\.${slugify(siteSlug)}\\.`), '')
}

function extractWikiAssetSlug(value) {
  return String(value ?? '').split('.').at(-1) ?? ''
}

const lowSignalTextPatterns = [
  /\b(sign in|log in|subscribe|cookie policy|privacy policy|terms of service|enable javascript|javascript required|access denied|page not found)\b/i,
  /\b(do not use copyrighted|public domain music|permanent ban|do not resubmit|theft)\b/i,
  /^\d+\s+points?,\s+\d+\s+comments?$/i,
]

function keywordMatchStats(text, keyword) {
  const haystack = String(text ?? '').toLowerCase()
  const tokens = keywordTokens(keyword)
  if (tokens.length === 0) {
    return { matchedCount: 0, ratio: 0, tokens: [] }
  }

  const matchedTokens = tokens.filter((token) => haystack.includes(token))
  return {
    matchedCount: matchedTokens.length,
    ratio: matchedTokens.length / tokens.length,
    tokens: matchedTokens,
  }
}

function isLowSignalText(text) {
  const normalized = compactText(text, 400)
  if (!normalized) return true
  if (normalized.length < 24) return true
  return lowSignalTextPatterns.some((pattern) => pattern.test(normalized))
}

const useCaseNoisePatterns = [
  /\bpricing\b/i,
  /\balternatives?\b/i,
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\breview\b/i,
  /\bsetup guide\b/i,
  /\bworkflow guide\b/i,
  /\bbest\b/i,
  /\btop \d+\b/i,
  /\bprompts?\b/i,
  /\btemplate(s)?\b/i,
  /\blibrary\b/i,
  /\bchecklist\b/i,
]

const videoUseCasePatterns = [
  {
    label: 'short-form product demo videos',
    patterns: [/\b(product demo|demo video|product walkthrough|saas demo)\b/i],
  },
  {
    label: 'screenshot-to-video launch clips',
    patterns: [/\b(screenshot to video|screenshot-to-video|product screenshot to demo video)\b/i],
  },
  {
    label: 'image-to-video clips',
    patterns: [/\b(image to video|image-to-video|still images?|photos?|artwork)\b/i],
  },
  {
    label: 'launch and product update videos',
    patterns: [/\b(launch video|launch clips?|product update|release announcement)\b/i],
  },
  {
    label: 'training and onboarding videos',
    patterns: [/\b(training|onboarding|educational content|internal communication|explainer)\b/i],
  },
  {
    label: 'multilingual avatar-led explainers',
    patterns: [/\b(140 languages|multilingual|ai avatars?|presenter-style)\b/i],
  },
  {
    label: 'blog-post-to-video marketing clips',
    patterns: [/\b(blog post|script or blog post|marketers?|marketing)\b/i],
  },
  {
    label: 'batch social video production',
    patterns: [/\b(bulk editing|large-scale production|content calendar|batch generation|20\+ videos per week)\b/i],
  },
  {
    label: 'episodic branded story videos',
    patterns: [/\b(reusable characters|universes|storytelling|10 minutes long|series)\b/i],
  },
  {
    label: 'API-based video generation for applications',
    patterns: [/\b(api(?:-based)?|developers building applications|google cloud|gemini api|subscription caps|high-volume|operating at volumes)\b/i],
  },
]

const agentUseCasePatterns = [
  {
    label: 'production agent orchestration',
    patterns: [/\b(orchestrat|multi agent|multi-agent)\b/i],
  },
  {
    label: 'production agent runtimes',
    patterns: [/\b(agent runtime|runtime framework|runtime)\b/i],
  },
  {
    label: 'tool-calling agent stacks',
    patterns: [/\b(tool calling|tool-calling|agent sdk|sdk)\b/i],
  },
  {
    label: 'agent memory and retrieval stacks',
    patterns: [/\b(agent memory|memory stack|retrieval)\b/i],
  },
  {
    label: 'embedded agents inside product workflows',
    patterns: [/\b(integrat|application|product workflow|production)\b/i],
  },
]

const useCaseScenarioProfiles = {
  'short-form product demo videos': {
    audience:
      'product marketers and indie hackers shipping feature launches, homepage refreshes, or short SaaS walkthroughs',
    trigger:
      'A release, feature walkthrough, or landing page update needs a concrete demo clip without rebuilding the process from scratch.',
    workflow:
      'Collect the product states, define the single angle to show, generate one short pass, and save the winning prompt plus review notes for the next launch.',
    outcome:
      'A reusable demo workflow the next teammate can repeat for the next feature announcement.',
    preferredAssetSlug: 'prompt-pack',
  },
  'launch and product update videos': {
    audience:
      'operators turning changelogs, launch notes, and feature drops into repeatable announcement assets',
    trigger:
      'The team has a new release to announce and wants a faster path from product update to publish-ready clip.',
    workflow:
      'Turn the release note into a one-angle brief, pick the launch frames, run a short pilot, then document the review loop for the next announcement.',
    outcome:
      'A launch clip process that keeps release marketing consistent instead of reinventing each update.',
    preferredAssetSlug: 'prompt-pack',
  },
  'image-to-video clips': {
    audience:
      'creators and operators who start from screenshots, still frames, artwork, or product images instead of filmed footage',
    trigger:
      'A still image or screenshot set needs motion treatment, but the team does not yet know which workflow creates the cleanest first pass.',
    workflow:
      'Choose the source image set, define the motion goal, compare one primary tool plus one fallback, then capture the settings that survive review.',
    outcome:
      'A first-pass image-to-video recipe with less prompt thrash and clearer review criteria.',
    preferredAssetSlug: 'comparison-worksheet',
  },
  'batch social video production': {
    audience:
      'content operators managing repeatable social calendars, series production, or weekly clip batches',
    trigger:
      'The team needs throughput and consistency across multiple short videos, not just one impressive experiment.',
    workflow:
      'Lock one repeatable format, batch the source inputs, document the review loop, and use a checklist so every new video does not start from zero.',
    outcome:
      'A batch workflow that preserves consistency across repeated social production cycles.',
    preferredAssetSlug: 'workflow-checklist',
  },
  'screenshot-to-video launch clips': {
    audience:
      'product teams converting UI screenshots, changelog visuals, and before-after states into launch content',
    trigger:
      'The product already has screenshots, but the team needs a clean way to turn them into motion assets for launch or sales follow-up.',
    workflow:
      'Pick the screenshot sequence, define the story arc, run one motion pass, and save the prompt structure that makes screenshots reusable in future launches.',
    outcome:
      'A screenshot-to-video playbook that turns product visuals into a repeatable launch asset.',
    preferredAssetSlug: 'prompt-pack',
  },
  'training and onboarding videos': {
    audience:
      'enablement, onboarding, and internal comms teams that need consistent walkthroughs for repeated training use cases',
    trigger:
      'A process, feature, or internal workflow needs to be taught repeatedly without hand-editing every new explanation from scratch.',
    workflow:
      'Define the lesson outcome, map the key steps, generate a draft walkthrough, and use a checklist to keep future updates aligned with the same review standard.',
    outcome:
      'A training workflow that keeps onboarding content repeatable as the product or process changes.',
    preferredAssetSlug: 'workflow-checklist',
  },
  'episodic branded story videos': {
    audience:
      'teams producing recurring narrative or branded series content that needs continuity across multiple episodes',
    trigger:
      'The content must feel consistent across a series, which makes reusable universes, prompts, and review notes more important than one-off output speed.',
    workflow:
      'Define the recurring story frame, keep the visual rules stable, test one episode workflow, then package the winning prompt set into a reusable asset.',
    outcome:
      'A repeatable episodic workflow with fewer style resets between episodes.',
    preferredAssetSlug: 'prompt-pack',
  },
  'API-based video generation for applications': {
    audience:
      'developers and product teams embedding video generation into an application or repeated internal workflow',
    trigger:
      'Usage limits, billing predictability, or production throughput matter more than a casual subscription test.',
    workflow:
      'Compare API costs, define the production trigger, test one narrow integration path, and use a worksheet to document the operational tradeoffs before scaling.',
    outcome:
      'A clearer build-vs-buy view with explicit cost, integration, and review-loop tradeoffs.',
    preferredAssetSlug: 'comparison-worksheet',
  },
  'production agent orchestration': {
    audience:
      'builders comparing how to route, supervise, and recover multi-step agent work inside production systems',
    trigger:
      'The team is moving beyond a single copilot and now needs coordination, retry, and tool-use rules that survive real workloads.',
    workflow:
      'Define the agent boundary, shortlist orchestration options, run one production-shaped benchmark, and capture the winning control pattern in a reusable asset.',
    outcome:
      'A production orchestration pattern that can be reused across future agent workflows.',
    preferredAssetSlug: 'stack-shortlist',
  },
  'production agent runtimes': {
    audience:
      'engineering teams evaluating which runtime can support durable, observable, production agent execution',
    trigger:
      'Prototype code is no longer enough and the team needs runtime-level guarantees, observability, and deployment fit.',
    workflow:
      'List the runtime requirements, benchmark one narrow workload, compare failure handling, and keep the result in an evaluation worksheet.',
    outcome:
      'A runtime selection path that is grounded in workload fit, not only framework popularity.',
    preferredAssetSlug: 'evaluation-worksheet',
  },
  'tool-calling agent stacks': {
    audience:
      'builders deciding how agents should call tools, handle schemas, and recover from tool failures',
    trigger:
      'The project needs reliable tool use and wants a repeatable way to compare SDKs, wrappers, and runtime behavior.',
    workflow:
      'Define the tool-calling contract, test a representative workflow, compare observability and retry paths, then save the decision criteria as a reusable stack asset.',
    outcome:
      'A clearer tool-calling stack decision that the team can revisit as requirements change.',
    preferredAssetSlug: 'stack-shortlist',
  },
  'agent memory and retrieval stacks': {
    audience:
      'teams deciding what memory, retrieval, and state model an agent system should use in production',
    trigger:
      'Context retention and retrieval quality are becoming the bottleneck in repeated agent tasks.',
    workflow:
      'Define the retention need, compare memory patterns, test retrieval quality on one real workload, and preserve the winning evaluation as a benchmark checklist.',
    outcome:
      'A memory stack decision grounded in retrieval behavior instead of generic architecture talk.',
    preferredAssetSlug: 'benchmark-checklist',
  },
  'embedded agents inside product workflows': {
    audience:
      'product and engineering teams embedding agents directly into recurring user or operator workflows',
    trigger:
      'The question is no longer whether to use agents, but where they fit inside a real product flow and what guardrails they need.',
    workflow:
      'Pick one recurring workflow, define the handoff boundary, evaluate the runtime and tool stack, then document the winning design in a reusable worksheet.',
    outcome:
      'An embedded-agent pattern that can be handed off across product and engineering without fuzzy boundaries.',
    preferredAssetSlug: 'evaluation-worksheet',
  },
}

function cleanUseCaseText(value, maxLength = 220) {
  return compactText(
    String(value ?? '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim(),
    maxLength,
  )
}

function inferUseCaseDomain(cluster) {
  const context = [
    cluster.primaryKeyword,
    cluster.audience,
    cluster.siteDefinition,
    ...safeArray(cluster.keywordBoundary),
    ...safeArray(cluster.supportKeywords),
  ]
    .filter(Boolean)
    .join(' ')

  if (/\b(video|demo|creator|storytelling|screenshot|image to video|launch clip|product update)\b/i.test(context)) {
    return 'video'
  }

  if (/\b(agent|runtime|orchestration|tool calling|memory stack|sdk|multi agent)\b/i.test(context)) {
    return 'agent'
  }

  return 'generic'
}

function getUseCasePatternLibrary(cluster) {
  const domain = inferUseCaseDomain(cluster)
  if (domain === 'video') return videoUseCasePatterns
  if (domain === 'agent') return agentUseCasePatterns
  return []
}

function pluralizeUseCasePhrase(label) {
  const replacements = [
    [/\bvideo$/i, 'videos'],
    [/\bclip$/i, 'clips'],
    [/\bworkflow$/i, 'workflows'],
    [/\bdemo$/i, 'demos'],
    [/\bframework$/i, 'frameworks'],
    [/\bstack$/i, 'stacks'],
    [/\bruntime$/i, 'runtimes'],
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(label)) {
      return label.replace(pattern, replacement)
    }
  }

  return label
}

function looksLikeUseCaseNoise(text) {
  const normalized = cleanUseCaseText(text, 160).toLowerCase()
  if (!normalized) return true
  if (normalized.split(/\s+/).length < 2) return true
  return useCaseNoisePatterns.some((pattern) => pattern.test(normalized))
}

function extractPatternUseCaseLabels(text, cluster) {
  const normalized = cleanUseCaseText(text, 220)
  if (!normalized) return []

  return getUseCasePatternLibrary(cluster)
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
    .map((rule) => rule.label)
}

function fallbackKeywordUseCaseLabel(keyword, cluster) {
  const domain = inferUseCaseDomain(cluster)
  let normalized = cleanUseCaseText(keyword, 120).toLowerCase()
  if (!normalized) return null
  if (useCaseNoisePatterns.some((pattern) => pattern.test(normalized))) return null

  normalized = normalized
    .replace(/\b(ai|best|top|free|cheap|the)\b/g, ' ')
    .replace(/\b(generator|software|tools?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized.split(/\s+/).length < 3) return null

  if (domain === 'video') {
    normalized = normalized
      .replace(/\bproduct screenshot to demo video\b/g, 'screenshot-to-demo launch clip')
      .replace(/\bscreenshot to video\b/g, 'screenshot-to-video launch clip')
      .replace(/\bimage to video\b/g, 'image-to-video clip')
      .replace(/\bproduct demo video\b/g, 'short-form product demo video')
      .replace(/\bproduct update video\b/g, 'launch and product update video')
      .replace(/\blaunch video workflow\b/g, 'launch video workflow')
      .replace(/\bdemo video generator for saas\b/g, 'saas product demo video')
      .replace(/\bcontent\b/g, 'videos')
  }

  if (domain === 'agent') {
    normalized = normalized
      .replace(/\btool calling sdk\b/g, 'tool-calling agent stack')
      .replace(/\bagent runtime framework\b/g, 'production agent runtime')
      .replace(/\bai agent orchestration\b/g, 'production agent orchestration')
      .replace(/\bmulti agent workflow\b/g, 'multi-agent orchestration workflow')
      .replace(/\bagent memory stack\b/g, 'agent memory and retrieval stack')
  }

  normalized = pluralizeUseCasePhrase(normalized)
  return looksLikeUseCaseNoise(normalized) ? null : normalized
}

function scoreUseCaseCandidate(label, cluster, meta = {}) {
  const thesisTokens = buildRoutingTokenSet([
    cluster.primaryKeyword,
    cluster.audience,
    cluster.siteDefinition,
    ...safeArray(cluster.keywordBoundary),
    ...safeArray(cluster.supportKeywords),
  ])
  const boundaryTokens = buildRoutingTokenSet([
    cluster.primaryKeyword,
    ...safeArray(cluster.keywordBoundary),
    ...safeArray(cluster.supportKeywords),
  ])
  const labelTokens = routingKeywordTokens(label)
  const alignment = overlapRatio(labelTokens, thesisTokens)
  const boundaryAlignment = overlapRatio(labelTokens, boundaryTokens)

  let score = 0.18 + alignment * 0.34 + boundaryAlignment * 0.26
  if (meta.firstPartyEvidence) score += 0.14
  if (meta.sourceCategory === 'workflow') score += 0.12
  if (meta.sourceCategory === 'official') score += 0.08
  if (meta.sourceCategory === 'deep-research') score += 0.1
  if (meta.sourceCategory === 'keyword-boundary') score += 0.12
  if (meta.researchQualityScore != null) score += Math.min(meta.researchQualityScore, 0.5) * 0.36

  const wordCount = label.split(/\s+/).length
  if (wordCount >= 3 && wordCount <= 7) score += 0.08
  if (!/\b(ai|guide|compare|comparison)\b/i.test(label)) score += 0.06

  return round(clamp(score, 0, 1), 2)
}

function buildUseCaseCandidate(label, cluster, meta = {}) {
  const normalized = cleanUseCaseText(label, 120).replace(/[.;:,]+$/g, '').trim()
  if (!normalized || looksLikeUseCaseNoise(normalized)) return null

  return {
    key: slugify(normalized),
    label: normalized,
    score: scoreUseCaseCandidate(normalized, cluster, meta),
  }
}

function buildResearchUseCases(cluster, firecrawlEntries = []) {
  const keywordCandidates = dedupe([
    cluster.primaryKeyword,
    ...safeArray(cluster.supportKeywords),
    ...safeArray(cluster.keywordBoundary),
  ])
    .flatMap((keyword) => {
      const matchedLabels = extractPatternUseCaseLabels(keyword, cluster)
      if (matchedLabels.length > 0) return matchedLabels

      const fallback = fallbackKeywordUseCaseLabel(keyword, cluster)
      return fallback ? [fallback] : []
    })
    .map((label) => buildUseCaseCandidate(label, cluster, { sourceCategory: 'keyword-boundary' }))
    .filter(Boolean)

  const evidenceCandidates = firecrawlEntries
    .flatMap((entry) =>
      extractPatternUseCaseLabels(entry.detail, cluster).map((label) =>
        buildUseCaseCandidate(label, cluster, entry),
      ),
    )
    .filter(Boolean)

  const bestCandidates = new Map()
  for (const candidate of [...keywordCandidates, ...evidenceCandidates]) {
    const existing = bestCandidates.get(candidate.key)
    if (!existing || candidate.score > existing.score) {
      bestCandidates.set(candidate.key, candidate)
    }
  }

  return [...bestCandidates.values()]
    .toSorted((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.label.localeCompare(right.label)
    })
    .slice(0, 6)
    .map((item) => item.label)
}

function selectUseCaseAsset(profile, assetSystem, label = '') {
  const preferredSlug = profile?.preferredAssetSlug
  const allAssets = [assetSystem.primaryAsset, ...assetSystem.secondaryAssets]
    .filter(Boolean)
    .toSorted(
      (left, right) =>
        preferFiniteNumber(right?.reuseScore, computeAssetReuseScore(right)) -
        preferFiniteNumber(left?.reuseScore, computeAssetReuseScore(left)),
    )
  if (preferredSlug) {
    const match = allAssets.find((asset) => asset.slug === preferredSlug)
    if (match) return match
  }

  if (/\b(compare|pricing|api|runtime|stack|worksheet)\b/i.test(label)) {
    return assetSystem.secondaryAssets[1] ?? assetSystem.primaryAsset
  }

  if (/\b(batch|training|workflow|onboarding|checklist)\b/i.test(label)) {
    return assetSystem.secondaryAssets[0] ?? assetSystem.primaryAsset
  }

  return assetSystem.primaryAsset
}

function resolveUseCaseSourceIds(label, cluster, firecrawlEntries, fallbackSourceIds = []) {
  const sourceIds = firecrawlEntries
    .filter((entry) => extractPatternUseCaseLabels(entry.detail, cluster).includes(label))
    .flatMap((entry) => safeArray(entry.sourceIds))

  return dedupe(sourceIds).slice(0, 3).length > 0
    ? dedupe(sourceIds).slice(0, 3)
    : fallbackSourceIds.slice(0, 2)
}

function buildResearchUseCaseModels(
  cluster,
  useCases,
  firecrawlEntries,
  assetSystem,
  fallbackSourceIds = [],
) {
  return useCases.map((label) => {
    const profile = useCaseScenarioProfiles[label] ?? {}
    const asset = selectUseCaseAsset(profile, assetSystem, label)

    return {
      id: slugify(label),
      label,
      audience:
        profile.audience ??
        `${cluster.audience} who need a narrower path than a generic ${cluster.primaryKeyword} overview.`,
      trigger:
        profile.trigger ??
        `The team has a concrete job around ${label} and needs a repeatable first workflow instead of another broad category read.`,
      workflow:
        profile.workflow ??
        `Start with one narrow pilot for ${label}, define the input/output and review standard, then package the winning path into ${asset.title}.`,
      outcome:
        profile.outcome ??
        `A reusable first-pass workflow for ${label} that makes the next run faster and less generic.`,
      cta: {
        assetSlug: asset.slug,
        title: asset.title,
        event: asset.event,
        reason:
          asset.summary ||
          `${asset.title} gives this use case a concrete next step after the first comparison or pilot.`,
      },
      sourceIds: resolveUseCaseSourceIds(label, cluster, firecrawlEntries, fallbackSourceIds),
    }
  })
}

function scoreSignalItem(item, keyword) {
  const haystack = `${item.title ?? ''} ${item.snippet ?? ''} ${item.url ?? ''}`
  const keywordLower = String(keyword ?? '').toLowerCase()
  const matchStats = keywordMatchStats(haystack, keyword)
  const exactKeywordBoost = haystack.toLowerCase().includes(keywordLower) ? 0.24 : 0
  const workflowBoost =
    /\b(workflow|guide|tutorial|prompt|checklist|template|compare|pricing|video|demo)\b/i.test(
      haystack,
    )
      ? 0.12
      : 0
  const brandBoost =
    item.domain && keywordMatchStats(item.domain.replace(/\./g, ' '), keyword).matchedCount > 0
      ? 0.08
      : 0
  const lowSignalPenalty = isLowSignalText(item.snippet || item.title) ? 0.32 : 0

  return round(
    clamp(matchStats.ratio * 0.62 + matchStats.matchedCount * 0.08 + exactKeywordBoost + workflowBoost + brandBoost - lowSignalPenalty, 0, 1),
    2,
  )
}

function rankSignalRichItems(items, keyword, { dropLowSignal = false } = {}) {
  return normalizeCollection(items)
    .map((item) => ({
      ...item,
      __signalScore: scoreSignalItem(item, keyword),
    }))
    .filter((item) =>
      item.__signalScore >= 0.18 ||
      matchesKeywordTokens(
        `${item.title ?? ''} ${item.snippet ?? ''} ${item.url ?? ''}`,
        keyword,
      ),
    )
    .filter((item) => !dropLowSignal || !isLowSignalText(item.snippet || item.title))
    .toSorted((left, right) => {
      if (right.__signalScore !== left.__signalScore) {
        return right.__signalScore - left.__signalScore
      }
      return (right.detectedYear ?? 0) - (left.detectedYear ?? 0)
    })
    .map(({ __signalScore, ...item }) => item)
}

function repeatedSentenceCount(text) {
  const counts = new Map()
  const sentences = String(text ?? '')
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim())
    .filter((sentence) => sentence.length >= 32)

  for (const sentence of sentences) {
    counts.set(sentence, (counts.get(sentence) ?? 0) + 1)
  }

  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + (count - 1), 0)
}

function countSpecificMarkers(text) {
  const normalized = String(text ?? '')
  const numeric = (normalized.match(/\b\d+(?:\.\d+)?\b/g) ?? []).length
  const branded = (normalized.match(/\b([A-Z][a-z0-9]+(?:\.[a-z]+)?|n8n|reddit|github|google|veo|kling|seedance|tavus|runway)\b/g) ?? []).length
  const structural = (normalized.match(/\b(workflow|pricing|checklist|template|prompt|comparison|pilot|asset)\b/gi) ?? []).length
  return numeric + Math.min(branded, 6) + Math.min(structural, 6)
}

function computePageSpecificityScore(page) {
  const textParts = [
    page.intro,
    ...safeArray(page.originalAnchors),
    ...safeArray(page.verdicts).flatMap((item) => [item.title, item.detail]),
    ...safeArray(page.keyFacts).flatMap((item) => [item.label, item.value]),
    ...safeArray(page.evidenceCards).flatMap((item) => [item.label, item.detail]),
    ...safeArray(page.examples).flatMap((item) => [item.title, item.body]),
    ...safeArray(page.sections).flatMap((section) => [...safeArray(section.paragraphs), ...safeArray(section.bullets)]),
  ]

  return countSpecificMarkers(textParts.filter(Boolean).join(' '))
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildPageParagraphs(page) {
  return [
    page.intro,
    ...safeArray(page.sections).flatMap((section) => safeArray(section.paragraphs)),
    ...safeArray(page.examples).map((item) => item.body),
    ...safeArray(page.verdicts).map((item) => item.detail),
    ...safeArray(page.evidenceCards).map((item) => item.detail),
  ]
    .map((paragraph) => stripHtml(String(paragraph ?? '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function countPhraseMatches(text, phrases) {
  const normalized = stripHtml(String(text ?? '')).toLowerCase()
  return phrases.reduce((sum, phrase) => {
    const matches = normalized.match(new RegExp(escapeRegExp(phrase.toLowerCase()), 'g')) ?? []
    return sum + matches.length
  }, 0)
}

function isLowEvidenceParagraph(text) {
  const normalized = stripHtml(String(text ?? '')).replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  if (normalized.split(/\s+/).length < 18) return false
  return countSpecificMarkers(normalized) < 2
}

function analyzePageNarrative(page) {
  const paragraphs = buildPageParagraphs(page)
  const genericParagraphCount = paragraphs.filter(
    (paragraph) =>
      countPhraseMatches(paragraph, genericContentPhrases) > 0 ||
      /\b(this page|this section|should help|should explain|should include|useful page)\b/i.test(
        paragraph,
      ),
  ).length
  const aiFlavorParagraphCount = paragraphs.filter(
    (paragraph) => countPhraseMatches(paragraph, aiFlavorPhrases) > 0,
  ).length
  const lowEvidenceParagraphCount = paragraphs.filter((paragraph) =>
    isLowEvidenceParagraph(paragraph),
  ).length

  return {
    paragraphCount: paragraphs.length,
    genericPhraseCount: countPhraseMatches(paragraphs.join(' '), genericContentPhrases),
    aiFlavorPhraseCount: countPhraseMatches(paragraphs.join(' '), aiFlavorPhrases),
    genericParagraphCount,
    aiFlavorParagraphCount,
    lowEvidenceParagraphCount,
  }
}

function formatMarkdownBullets(items, formatter = (item) => item) {
  const lines = normalizeCollection(items).map((item) => `- ${formatter(item)}`)
  return lines.length > 0 ? lines : ['- None yet.']
}

function toWikiId(type, ...parts) {
  return [type, ...parts]
    .map((part) => slugify(String(part ?? '')))
    .filter(Boolean)
    .join('.')
}

function normalizeServiceAccountPrivateKey(value) {
  return value.replace(/^['"]|['"]$/g, '').replaceAll('\\n', '\n').trim()
}

function normalizeGa4PropertyId(value) {
  return value.replace(/^properties\//, '').trim()
}

function buildFallbackActiveThesisFromExperiment(currentExperiment) {
  const fallbackSeedKeywords = currentExperiment.seedTopics.map((topic) => topic.keyword)
  const fallbackTopicKeywords = currentExperiment.seedTopics.flatMap((topic) => topic.supportPageIdeas ?? [])
  return {
    thesisKey: currentExperiment.thesisKey,
    status: 'active',
    domain: safeDomainFromBaseUrl(config.baseUrl),
    siteSlug: currentExperiment.siteSlug,
    theme: currentExperiment.thesisKey,
    label: currentExperiment.thesisLabel,
    thesisName: currentExperiment.thesisName,
    audience: currentExperiment.targetAudience,
    intentTypes: ['tool', 'compare', 'buy'],
    monetization: currentExperiment.monetization,
    seedKeywords: fallbackSeedKeywords,
    topicKeywords: fallbackTopicKeywords,
    contentAssets: [currentExperiment.leadMagnet, currentExperiment.conversionAsset],
    brandBoundary: currentExperiment.siteDefinition,
    primaryKeywordStrategy: 'pinned',
    pinnedPrimaryKeyword: fallbackSeedKeywords[0] ?? currentExperiment.thesisLabel,
    keywordBoundary: dedupe([...fallbackSeedKeywords, ...fallbackTopicKeywords]),
  }
}

function normalizeThesisRegistry(configPayload, currentExperiment) {
  const configuredEntries = Array.isArray(configPayload?.theses) ? configPayload.theses : []
  return dedupeBy(
    [
      buildFallbackActiveThesisFromExperiment(currentExperiment),
      ...configuredEntries,
    ].map((entry) => ({
      thesisKey: entry.thesisKey,
      status: entry.status ?? 'candidate',
      domain: entry.domain ?? null,
      siteSlug: entry.siteSlug ?? slugify(entry.label ?? entry.thesisKey),
      theme: entry.theme ?? entry.thesisKey,
      label: entry.label ?? entry.thesisKey,
      thesisName: entry.thesisName ?? entry.label ?? entry.thesisKey,
      audience: entry.audience ?? '',
      intentTypes: entry.intentTypes ?? ['tool', 'compare', 'buy'],
      monetization: entry.monetization ?? [],
      seedKeywords: entry.seedKeywords ?? [],
      topicKeywords: entry.topicKeywords ?? [],
      contentAssets: entry.contentAssets ?? [],
      brandBoundary: entry.brandBoundary ?? '',
      primaryKeywordStrategy:
        entry.primaryKeywordStrategy ??
        ((entry.status ?? 'candidate') === 'active' ? 'pinned' : 'dynamic'),
      pinnedPrimaryKeyword:
        entry.pinnedPrimaryKeyword ??
        entry.seedKeywords?.[0] ??
        null,
      keywordBoundary: dedupe(
        [
          ...(entry.keywordBoundary ?? []),
          ...(entry.seedKeywords ?? []),
          ...(entry.topicKeywords ?? []),
        ].filter(Boolean),
      ),
    })),
    'thesisKey',
  )
}

function buildDiscoveryPatternKeywords(currentExperiment, theses) {
  return dedupe(
    [
      ...(currentExperiment.discoveryKeywords ?? []),
      ...theses.flatMap((entry) => [
        ...(entry.seedKeywords ?? []),
        ...(entry.topicKeywords ?? []),
      ]),
    ]
      .flatMap((item) => String(item ?? '').split(/[^a-z0-9]+/i))
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length >= 3),
  )
}

function buildSeedTopics(currentExperiment, theses) {
  const explicitTopics = (currentExperiment.seedTopics ?? []).map((topic) => ({
    ...topic,
    categoryHint: topic.categoryHint ?? currentExperiment.thesisKey,
  }))
  const explicitTopicKeywords = new Set(
    explicitTopics.map((topic) => `${topic.categoryHint ?? ''}:${topic.keyword.toLowerCase()}`),
  )
  const syntheticTopics = theses.flatMap((thesis) =>
    (thesis.seedKeywords ?? []).map((keyword) => ({
      keyword,
      source: `Thesis registry seed (${thesis.thesisKey})`,
      region: 'US',
      categoryHint: thesis.theme ?? thesis.thesisKey,
      supportPageIdeas: (thesis.topicKeywords ?? []).slice(0, 4),
    })),
  )

  return dedupeBy(
    [
      ...explicitTopics,
      ...syntheticTopics.filter(
        (topic) =>
          !explicitTopicKeywords.has(`${topic.categoryHint ?? ''}:${topic.keyword.toLowerCase()}`),
      ),
    ],
    'keyword',
  )
}

function buildThemeAssetCatalog(theme, thesisLabel) {
  const lowerLabel = thesisLabel.toLowerCase()

  if (theme === 'agent-infrastructure') {
    return {
      primaryAsset: {
        slug: 'stack-shortlist',
        title: `${thesisLabel} stack shortlist`,
        type: 'shortlist',
        event: 'download_shortlist',
        summary: 'A production-minded shortlist with orchestration, memory, tool calling, and observability tradeoffs.',
      },
      secondaryAssets: [
        {
          slug: 'evaluation-worksheet',
          title: `${thesisLabel} evaluation worksheet`,
          type: 'worksheet',
          event: 'generate_lead',
          summary: 'A worksheet to score runtime, memory, routing, and deployment fit.',
        },
        {
          slug: 'benchmark-checklist',
          title: `${thesisLabel} benchmark checklist`,
          type: 'checklist',
          event: 'download_checklist',
          summary: 'A benchmark checklist for comparing agent frameworks under real workloads.',
        },
      ],
    }
  }

  if (theme === 'video-creation') {
    return {
      primaryAsset: {
        slug: 'prompt-pack',
        title: `${thesisLabel} prompt pack`,
        type: 'template',
        event: 'generate_lead',
        summary: 'A ready-to-run pack covering hooks, screenshots, transitions, and short-form demo prompts.',
      },
      secondaryAssets: [
        {
          slug: 'workflow-checklist',
          title: `${thesisLabel} workflow checklist`,
          type: 'checklist',
          event: 'download_checklist',
          summary: 'A checklist for moving from source asset to publish-ready short-form demo.',
        },
        {
          slug: 'comparison-worksheet',
          title: `${thesisLabel} comparison worksheet`,
          type: 'worksheet',
          event: 'download_shortlist',
          summary: 'A worksheet to compare output quality, speed, pricing clarity, and editing overhead.',
        },
      ],
    }
  }

  return {
    primaryAsset: {
      slug: slugify(`${lowerLabel}-playbook`),
      title: `${thesisLabel} playbook`,
      type: 'playbook',
      event: 'generate_lead',
      summary: `A practical playbook for teams evaluating ${lowerLabel}.`,
    },
    secondaryAssets: [
      {
        slug: slugify(`${lowerLabel}-checklist`),
        title: `${thesisLabel} checklist`,
        type: 'checklist',
        event: 'download_checklist',
        summary: `A launch checklist to evaluate and implement ${lowerLabel}.`,
      },
      {
        slug: slugify(`${lowerLabel}-worksheet`),
        title: `${thesisLabel} worksheet`,
        type: 'worksheet',
        event: 'download_shortlist',
        summary: `A worksheet to compare options and document next steps for ${lowerLabel}.`,
      },
    ],
  }
}

function buildThesisRuntime(entry) {
  const preset = themePresets[entry.theme] ?? themePresets['general-explainers']
  const assetCatalog = buildThemeAssetCatalog(entry.theme, entry.label ?? entry.thesisKey)
  const defaultPageTemplates = [
    'hub',
    'alternatives',
    'workflow',
    'faq',
    'best-of',
    'pricing',
    'free-vs-paid',
    'use-case',
    'template',
    'case-study',
  ]

  return {
    thesisKey: entry.thesisKey,
    status: entry.status,
    siteSlug: entry.siteSlug,
    theme: entry.theme,
    label: entry.label,
    thesisName: entry.thesisName,
    domain: entry.domain,
    audience: entry.audience || preset.audience,
    offer: preset.offer,
    monetization: entry.monetization?.length ? entry.monetization : preset.monetization,
    leadMagnet: assetCatalog.primaryAsset.title,
    ctaLabel: preset.ctaLabel,
    siteDefinition: entry.brandBoundary || preset.offer,
    expansionIdeas: preset.expansionIdeas,
    contentAssets: entry.contentAssets?.length
      ? entry.contentAssets
      : [assetCatalog.primaryAsset.title, ...assetCatalog.secondaryAssets.map((item) => item.title)],
    primaryKeywordStrategy: entry.primaryKeywordStrategy ?? 'dynamic',
    pinnedPrimaryKeyword: entry.pinnedPrimaryKeyword ?? entry.seedKeywords?.[0] ?? null,
    keywordBoundary: dedupe(
      [
        ...(entry.keywordBoundary ?? []),
        ...(entry.seedKeywords ?? []),
        ...(entry.topicKeywords ?? []),
      ].filter(Boolean),
    ),
    conversionAssetSystem: assetCatalog,
    pageTemplates: defaultPageTemplates.slice(0, contentConfig.pageCountTarget),
  }
}

function safeDomainFromBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return null
  }
}

function isoDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function buildDateRange(lookbackDays, lagDays = 0) {
  return {
    startDate: isoDaysAgo(lookbackDays + lagDays),
    endDate: isoDaysAgo(lagDays),
  }
}

async function fetchJson(url, init = {}, retries = 2) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TrendSitePipeline/1.0',
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }

    return response.json()
  } catch (error) {
    if (retries <= 0) {
      throw error
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
    return fetchJson(url, init, retries - 1)
  }
}

async function fetchText(url, init = {}, retries = 2) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': 'TrendSitePipeline/1.0',
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }

    return response.text()
  } catch (error) {
    if (retries <= 0) {
      throw error
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
    return fetchText(url, init, retries - 1)
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseJsonFromCliOutput(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const direct = safeJsonParse(normalized)
  if (direct) return direct

  const firstCurly = normalized.indexOf('{')
  const firstBracket = normalized.indexOf('[')
  const startCandidates = [firstCurly, firstBracket].filter((index) => index >= 0)
  if (startCandidates.length === 0) return null

  const startIndex = Math.min(...startCandidates)
  return safeJsonParse(normalized.slice(startIndex))
}

function firecrawlConfigured() {
  return firecrawlConfig.enabled && Boolean(firecrawlConfig.apiKey || firecrawlConfig.apiUrl)
}

function safeUrlHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function safeUrlOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function domainMatchesAny(domain, patterns) {
  return patterns.some((pattern) => domain === pattern || domain.endsWith(`.${pattern}`))
}

function guessTitleFromUrl(url) {
  try {
    const parsed = new URL(url)
    const pathTokens = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .map((token) => token.replace(/[-_]+/g, ' '))
      .map(titleCase)
    return pathTokens.length > 0 ? pathTokens.join(' / ') : parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function compactLines(lines, limit = 4) {
  return dedupe(
    normalizeCollection(lines)
      .map((line) => compactText(line, 220))
      .filter((line) => line.length >= 20),
  ).slice(0, limit)
}

function normalizeMarkdownSignalLine(line) {
  return compactText(
    String(line ?? '')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
      .replace(/^#{1,6}\s+/g, '')
      .replace(/^[-*+]\s+/g, '')
      .replace(/^>\s+/g, '')
      .replace(/`{1,3}/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    240,
  )
}

function looksLikeResearchNoiseLine(line) {
  const normalized = normalizeMarkdownSignalLine(line).toLowerCase()
  if (!normalized || normalized.length < 32) return true
  if (isLowSignalText(normalized)) return true
  if ((normalized.match(/https?:\/\//g) ?? []).length > 0) return true
  if ((normalized.match(/\[[^\]]+]/g) ?? []).length > 0) return true
  if (/^(sign in|log in|open in app|get app|listen|skip to|menu|search|recommended from|more from|create an account|try for free|request demo)\b/i.test(normalized)) {
    return true
  }
  if (/\b(sign in|log in|open in app|get app|recommended from|more from|create an account|comment|share|copy link|bookmark|clap)\b/i.test(normalized)) {
    return true
  }
  if (/^[#>|[\]().:;,'"!?/\-_\s\d]+$/.test(normalized)) return true
  return false
}

function scoreMarkdownSignalLine(line, keyword, patterns) {
  const normalized = normalizeMarkdownSignalLine(line)
  if (looksLikeResearchNoiseLine(normalized)) return -1

  const matchStats = keywordMatchStats(normalized, keyword)
  const numericBoost = /[$€£]|\b\d+(?:\.\d+)?(?:\/month|\/image|\/clip|x|%|k|m)?\b/i.test(normalized)
    ? 0.18
    : 0
  const patternBoost = patterns.some((pattern) => pattern.test(normalized)) ? 0.18 : 0
  const audienceBoost = /\b(team|creator|marketer|agency|developer|founder|operator|buyer|workflow|pricing|cost|compare|example)\b/i.test(normalized)
    ? 0.12
    : 0
  const sentenceBoost = /[.!?]/.test(normalized) ? 0.08 : 0
  const headingPenalty = normalized.split(' ').length <= 7 ? 0.22 : 0
  const markdownPenalty = /\b(read the full story|recommended from|open in app|sign in)\b/i.test(normalized)
    ? 0.32
    : 0

  return round(
    clamp(
      matchStats.ratio * 0.42 +
        matchStats.matchedCount * 0.08 +
        numericBoost +
        patternBoost +
        audienceBoost +
        sentenceBoost -
        headingPenalty -
        markdownPenalty,
      0,
      1,
    ),
    2,
  )
}

function shellEscape(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`
}

function extractMarkdownHeadings(markdown, limit = 8) {
  return compactLines(
    String(markdown ?? '')
      .split('\n')
      .filter((line) => /^#{1,4}\s+/.test(line))
      .map((line) => normalizeMarkdownSignalLine(line)),
    limit,
  )
}

function extractMarkdownSignalLines(markdown, patterns, keyword, limit = 4) {
  return String(markdown ?? '')
    .split('\n')
    .map((line) => ({
      original: line,
      normalized: normalizeMarkdownSignalLine(line),
    }))
    .filter((item) => item.normalized.length >= 32)
    .filter((item) => patterns.some((pattern) => pattern.test(item.normalized)))
    .map((item) => ({
      ...item,
      score: scoreMarkdownSignalLine(item.normalized, keyword, patterns),
    }))
    .filter((item) => item.score >= 0.22)
    .toSorted((left, right) => right.score - left.score)
    .map((item) => item.normalized)
    .filter((line, index, array) => array.findIndex((candidate) => candidate === line) === index)
    .slice(0, limit)
}

function normalizeFirecrawlLinks(value) {
  if (Array.isArray(value)) {
    return dedupe(
      value
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            return item.url ?? item.href ?? item.link ?? ''
          }
          return ''
        })
        .filter(Boolean),
    )
  }

  if (value && typeof value === 'object') {
    return dedupe(
      Object.values(value)
        .flatMap((item) => {
          if (typeof item === 'string') return [item]
          if (Array.isArray(item)) return item
          if (item && typeof item === 'object') return [item.url ?? item.href ?? item.link ?? '']
          return []
        })
        .filter(Boolean),
    )
  }

  return []
}

function unwrapFirecrawlPayload(payload) {
  if (payload?.data != null) return payload.data
  return payload
}

function extractFirecrawlSearchEntries(payload) {
  const data = unwrapFirecrawlPayload(payload)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.web)) return data.web
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function extractFirecrawlMapUrls(payload) {
  const data = unwrapFirecrawlPayload(payload)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.links)) return data.links
  if (Array.isArray(data?.urls)) return data.urls
  if (Array.isArray(payload?.links)) return payload.links
  return []
}

function extractFirecrawlScrapeDocument(payload) {
  const data = unwrapFirecrawlPayload(payload)
  return {
    markdown: String(data?.markdown ?? payload?.markdown ?? ''),
    summary: String(data?.summary ?? payload?.summary ?? data?.description ?? payload?.description ?? ''),
    metadata: data?.metadata ?? payload?.metadata ?? {},
    attributes: data?.attributes ?? payload?.attributes ?? {},
    links: normalizeFirecrawlLinks(data?.links ?? payload?.links ?? []),
    json: data?.json ?? payload?.json ?? null,
  }
}

function extractFirecrawlAgentOutput(payload) {
  const data = unwrapFirecrawlPayload(payload)
  const candidate =
    data?.output ??
    data?.result ??
    data?.finalOutput ??
    data?.response ??
    payload?.output ??
    payload?.result ??
    payload?.finalOutput ??
    data

  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate
  }

  if (typeof candidate === 'string') {
    return safeJsonParse(candidate)
  }

  return null
}

function countFirecrawlSignalCoverage(firecrawl) {
  const signalKeys = ['pricing', 'changelog', 'workflow', 'comparison', 'useCases', 'caveats']
  const typeCount = signalKeys.filter((key) => safeArray(firecrawl?.signals?.[key]).length > 0).length
  const totalCount = signalKeys.reduce(
    (sum, key) => sum + safeArray(firecrawl?.signals?.[key]).length,
    0,
  )

  return { typeCount, totalCount }
}

function looksLikeResearchChromeText(text) {
  const normalized = compactText(String(text ?? ''), 800).toLowerCase()
  if (!normalized) return false

  return [
    /\berror 403\b/,
    /\bforbidden\b/,
    /\byou signed (in|out)\b/,
    /\bsign in to change notification settings\b/,
    /\bcreate an account to read the full story\b/,
    /\brecommended from medium\b/,
    /\baccessibility system\b/,
    /\bskip navigation\b/,
    /\btap to unmute\b/,
    /\bwatch history\b/,
    /\bdismiss alert\b/,
    /\bcollapse file tree\b/,
    /\breload\b.*\brefresh your session\b/,
  ].some((pattern) => pattern.test(normalized))
}

function looksLikeConcretePricingLine(text) {
  const normalized = compactText(String(text ?? ''), 280)
  if (!normalized) return false

  return (
    /[$€£]|\b\d+(?:\.\d+)?(?:\/month|\/year|\/video|\/clip|\/image|\/second|%| credits?)\b/i.test(
      normalized,
    ) ||
    /\b(free plan|free tier|pricing starts|starts at|flat rate|per video|per second|per month|subscription|watermark|credit packs|enterprise pricing)\b/i.test(
      normalized,
    )
  )
}

function scoreFirecrawlResearchQuality(item, firecrawl, keyword) {
  const signalCoverage = countFirecrawlSignalCoverage(firecrawl)
  const summaryText = firecrawl.summary || firecrawl.metadata?.description || ''
  const evidenceText = [
    item.title,
    item.url,
    summaryText,
    ...safeArray(firecrawl.headings).slice(0, 6),
    firecrawl.markdownExcerpt,
  ]
    .filter(Boolean)
    .join(' ')
  const matchStats = keywordMatchStats(evidenceText, keyword)
  const detectedYear = detectYear(evidenceText)
  const currentYear = new Date().getUTCFullYear()

  let score = 0.12
  score += matchStats.ratio * 0.22
  score += Math.min(matchStats.matchedCount, 3) * 0.06
  score += Math.min(signalCoverage.typeCount, 4) * 0.1
  score += Math.min(signalCoverage.totalCount, 6) * 0.04

  if (looksLikePreferredEvidenceUrl(item.url)) score += 0.14
  if (!isLowSignalText(summaryText)) score += 0.08
  if (compactLines(firecrawl.headings, 4).length >= 2) score += 0.06
  if (/[$€£]|\b\d+(?:\.\d+)?(?:\/month|\/image|\/clip|\/video|%|x|k|m)\b/i.test(evidenceText)) {
    score += 0.08
  }

  if (signalCoverage.totalCount === 0) score -= 0.2
  if (looksLikeResearchChromeText(evidenceText)) score -= 0.5
  if (isResearchNoiseDomain(item.domain)) score -= 0.85
  if (isDeveloperSourceDomain(item.domain) && !keywordWantsDeveloperSources(keyword)) {
    score -= 0.36
  }
  if (detectedYear && detectedYear < currentYear - 2) score -= 0.18

  return round(clamp(score, 0, 1), 2)
}

function buildFirecrawlEvidenceSignals(markdown, keyword) {
  return {
    pricing: extractMarkdownSignalLines(
      markdown,
      [/\bpricing\b/i, /\bplan\b/i, /\btrial\b/i, /\bfree tier\b/i, /\bcredit\b/i, /\bmonthly\b/i, /\bcost\b/i, /[$€£]/],
      keyword,
    ),
    changelog: extractMarkdownSignalLines(
      markdown,
      [/\bchangelog\b/i, /\brelease\b/i, /\bupdated\b/i, /\bversion\b/i, /\blaunch(?:ed)?\b/i, /\bnew in 20\d{2}\b/i, /\bannounced\b/i],
      keyword,
    ),
    workflow: extractMarkdownSignalLines(
      markdown,
      [/\bworkflow\b/i, /\bguide\b/i, /\btutorial\b/i, /\bhow to\b/i, /\bprompt\b/i, /\btemplate\b/i, /\bstep-by-step\b/i, /\bsetup\b/i, /\bintegrate\b/i],
      keyword,
    ),
    comparison: extractMarkdownSignalLines(
      markdown,
      [/\bcompare\b/i, /\balternative\b/i, /\bvs\b/i, /\bbest for\b/i, /\bcomparison\b/i, /\bdifference\b/i],
      keyword,
    ),
    useCases: extractMarkdownSignalLines(
      markdown,
      [/\bbest for\b/i, /\bideal for\b/i, /\bgood fit for\b/i, /\bfor teams\b/i, /\bfor creators\b/i, /\bfor marketers\b/i, /\bfor agencies\b/i, /\bfor developers\b/i, /\bif you need to\b/i, /\bworks well for\b/i, /\buse this when\b/i],
      keyword,
    ),
    caveats: extractMarkdownSignalLines(
      markdown,
      [/\blimitation\b/i, /\bnot for\b/i, /\bwatch out\b/i, /\bcaveat\b/i, /\bfails?\b/i, /\bissue\b/i, /\bhidden\b/i, /\btradeoff\b/i, /\bbilling\b/i, /\btrap\b/i],
      keyword,
    ),
  }
}

function buildFirecrawlEnrichment(item, payload, keyword, mode = 'scrape') {
  const document = extractFirecrawlScrapeDocument(payload)
  const summary = compactText(
    document.summary || document.metadata?.description || item.snippet || item.title,
    240,
  )
  const markdown = document.markdown
  const headings = extractMarkdownHeadings(markdown)
  const signals = buildFirecrawlEvidenceSignals(markdown, keyword)
  const baseEnrichment = {
    source: 'firecrawl-cli',
    mode,
    title: document.metadata?.title ?? item.title,
    summary,
    markdownExcerpt: compactText(markdown, firecrawlConfig.excerptChars),
    headings,
    links: document.links.slice(0, 12),
    metadata: pickDefined({
      title: document.metadata?.title,
      description: document.metadata?.description,
      language: document.metadata?.language,
      statusCode: document.metadata?.statusCode,
      ogUrl: document.metadata?.ogUrl,
    }),
    attributes: document.attributes ?? {},
    signals,
  }
  const researchQualityScore = scoreFirecrawlResearchQuality(item, baseEnrichment, keyword)

  return {
    ...baseEnrichment,
    researchQualityScore,
    researchGrade: researchQualityScore >= 0.34,
  }
}

async function runFirecrawlJson(args, cache, cacheKey, timeoutMs = firecrawlConfig.timeoutMs) {
  if (!firecrawlConfigured()) return null
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const pending = (async () => {
    try {
      const commandParts = []
      const resolvedApiKey = firecrawlConfig.apiKey || process.env.FIRECRAWL_API_KEY || ''
      const resolvedApiUrl = firecrawlConfig.apiUrl || process.env.FIRECRAWL_API_URL || ''
      if (resolvedApiKey) {
        commandParts.push(`FIRECRAWL_API_KEY=${shellEscape(resolvedApiKey)}`)
      }
      if (resolvedApiUrl) {
        commandParts.push(`FIRECRAWL_API_URL=${shellEscape(resolvedApiUrl)}`)
      }
      commandParts.push('FIRECRAWL_NO_TELEMETRY=1')
      commandParts.push([firecrawlConfig.bin, ...args].map(shellEscape).join(' '))
      const command = commandParts.join(' ')
      const { stdout } = await execFileAsync('/bin/zsh', ['-lc', command], {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      })

      const trimmed = stdout.trim()
      if (!trimmed) return null

      return parseJsonFromCliOutput(trimmed)
    } catch {
      return null
    }
  })()

  cache.set(cacheKey, pending)
  const resolved = await pending
  cache.set(cacheKey, Promise.resolve(resolved))
  return resolved
}

async function fetchFirecrawlSearchResults(query, limit = 10, keyword = query) {
  const payload = await runFirecrawlJson(
    [
      'search',
      query,
      '--limit',
      String(Math.min(limit, firecrawlConfig.searchLimit)),
      '--country',
      'US',
      '--scrape',
      '--scrape-formats',
      'markdown,summary,links',
      '--json',
    ],
    firecrawlCommandCache,
    `search:${query}:${limit}:${keyword}`,
  )

  return extractFirecrawlSearchEntries(payload)
    .map((item) => {
      const url = item.url ?? item.link ?? item.href ?? item.metadata?.sourceURL ?? ''
      const title = item.title ?? item.metadata?.title ?? guessTitleFromUrl(url)
      const snippet = item.description ?? item.snippet ?? item.summary ?? ''
      const domain = safeUrlHostname(url)
      const firecrawl = buildFirecrawlEnrichment(
        { title, snippet, url, domain },
        item.scrape ?? item,
        keyword,
        'search',
      )

      return {
        title,
        url,
        snippet: firecrawl.summary || compactText(snippet || firecrawl.markdownExcerpt, 220),
        domain,
        firecrawl,
      }
    })
    .filter((item) => item.url)
}

async function scrapeFirecrawlUrl(url, keyword) {
  const payload = await runFirecrawlJson(
    [
      'scrape',
      '--url',
      url,
      '--format',
      'markdown,links',
      '--only-main-content',
      '--wait-for',
      String(firecrawlConfig.waitForMs),
      '--json',
    ],
    firecrawlScrapeCache,
    `scrape:${url}:${keyword}`,
  )

  if (!payload) return null
  return buildFirecrawlEnrichment(
    {
      title: guessTitleFromUrl(url),
      url,
      domain: safeUrlHostname(url),
      snippet: '',
    },
    payload,
    keyword,
    'scrape',
  )
}

async function mapFirecrawlUrls(origin, search) {
  const payload = await runFirecrawlJson(
    [
      'map',
      '--url',
      origin,
      '--search',
      search,
      '--limit',
      String(firecrawlConfig.mapLimit),
      '--json',
    ],
    firecrawlMapCache,
    `map:${origin}:${search}`,
  )

  return extractFirecrawlMapUrls(payload)
    .map((item) => (typeof item === 'string' ? item : item.url ?? item.href ?? item.link ?? ''))
    .filter(Boolean)
}

async function runFirecrawlResearchAgent(cluster, urls) {
  if (!firecrawlConfigured() || !firecrawlConfig.agentEnabled || urls.length === 0) return null

  const cacheKey = `agent:${cluster.siteSlug}:${urls.join('|')}`
  const payload = await runFirecrawlJson(
    [
      'agent',
      `Extract structured research notes for the topic "${cluster.primaryKeyword}" for ${cluster.audience}. Focus on pricing, workflow proof, changelog movement, use cases, failure modes, competitor positioning, and asset ideas. Return only schema-grounded output from the supplied URLs.`,
      '--urls',
      urls.join(','),
      '--schema-file',
      path.join(projectRoot, 'config', 'firecrawl', 'research-dossier.schema.json'),
      '--model',
      firecrawlConfig.agentModel,
      '--max-credits',
      String(firecrawlConfig.agentMaxCredits),
      '--wait',
      '--json',
    ],
    firecrawlAgentCache,
    cacheKey,
    Math.max(firecrawlConfig.timeoutMs, 5 * 60 * 1000),
  )

  return extractFirecrawlAgentOutput(payload)
}

function seededUnit(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  const integer = Number.parseInt(hash.slice(0, 8), 16)
  return integer / 0xffffffff
}

function seededBetween(key, min, max) {
  return min + seededUnit(key) * (max - min)
}

function buildMonitoringDelta(metrics, previousMetrics) {
  return previousMetrics == null
    ? null
    : {
        impressions: metrics.impressions - previousMetrics.impressions,
        clicks: metrics.clicks - previousMetrics.clicks,
        avgPosition: round(metrics.avgPosition - previousMetrics.avgPosition, 1),
        conversions: metrics.conversions - previousMetrics.conversions,
        revenue: round(metrics.revenue - previousMetrics.revenue, 2),
      }
}

function finalizeMonitoringMetrics(metrics, previousMetrics) {
  return {
    ...metrics,
    deltaFromPrevious: buildMonitoringDelta(metrics, previousMetrics),
  }
}

function hasGoogleServiceAccountAuth() {
  return Boolean(
    googleConfig.serviceAccountEmail && googleConfig.serviceAccountPrivateKey,
  )
}

function hasGoogleUserOAuthAuth() {
  return Boolean(
    googleConfig.oauthClientId &&
      googleConfig.oauthClientSecret &&
      googleConfig.oauthRefreshToken,
  )
}

function hasAnyGoogleAuth() {
  return hasGoogleUserOAuthAuth() || hasGoogleServiceAccountAuth()
}

function getGoogleAuthMissingNote() {
  return 'Add GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN, or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
}

function googleMonitoringEnabled() {
  return config.monitoringMode !== 'heuristic_forecast'
}

function getSitePathPrefix(site) {
  return site.homePath.replace(/index\.html$/, '')
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

async function getGoogleAccessToken(scopes) {
  if (!hasAnyGoogleAuth()) {
    throw new Error(getGoogleAuthMissingNote())
  }

  const authMode = hasGoogleUserOAuthAuth() ? 'oauth_user' : 'service_account'
  const scopeKey = [authMode, ...new Set(scopes)].sort().join(' ')
  const cached = googleTokenCache.get(scopeKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken
  }

  const normalizedScopes = [...new Set(scopes)].sort()
  const form = hasGoogleUserOAuthAuth()
    ? new URLSearchParams({
        client_id: googleConfig.oauthClientId,
        client_secret: googleConfig.oauthClientSecret,
        refresh_token: googleConfig.oauthRefreshToken,
        grant_type: 'refresh_token',
      })
    : (() => {
        const now = Math.floor(Date.now() / 1000)
        const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
        const payload = base64UrlEncode(
          JSON.stringify({
            iss: googleConfig.serviceAccountEmail,
            scope: normalizedScopes.join(' '),
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
          }),
        )
        const assertionBase = `${header}.${payload}`
        const signature = crypto
          .sign('RSA-SHA256', Buffer.from(assertionBase), googleConfig.serviceAccountPrivateKey)
          .toString('base64url')

        return new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${assertionBase}.${signature}`,
        })
      })()

  const tokenErrors = []
  for (const tokenUrl of googleConfig.oauthTokenUrls) {
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TrendSitePipeline/1.0',
        },
        body: form.toString(),
      })

      if (!response.ok) {
        const detail = await response.text()
        tokenErrors.push(`${tokenUrl} -> ${response.status} ${detail}`)
        continue
      }

      const payloadJson = await response.json()
      const expiresIn = Number(payloadJson.expires_in ?? 3600)
      googleTokenCache.set(scopeKey, {
        accessToken: payloadJson.access_token,
        expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
      })

      return payloadJson.access_token
    } catch (error) {
      tokenErrors.push(
        `${tokenUrl} -> ${error instanceof Error ? error.message : 'Unknown token error'}`,
      )
    }
  }

  throw new Error(
    `Google OAuth token exchange failed across ${googleConfig.oauthTokenUrls.length} endpoint(s): ${tokenErrors.join(' | ')}`,
  )
}

async function fetchGoogleJson(url, payload, scopes) {
  const accessToken = await getGoogleAccessToken(scopes)

  return fetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

function sumGoogleMetricRows(rows, metricIndex = 0) {
  return round(
    (rows ?? []).reduce(
      (sum, row) =>
        sum + Number.parseFloat(row.metricValues?.[metricIndex]?.value ?? '0'),
      0,
    ),
    2,
  )
}

async function fetchGscSiteMetrics(site) {
  if (!googleMonitoringEnabled()) {
    return {
      status: 'disabled',
      notes: ['MONITORING_MODE=heuristic_forecast, so GSC live monitoring is disabled.'],
    }
  }

  if (!hasAnyGoogleAuth()) {
    return {
      status: 'missing_credentials',
      notes: [getGoogleAuthMissingNote()],
    }
  }

  if (!googleConfig.gscSiteUrl) {
    return {
      status: 'missing_config',
      notes: ['Set GSC_SITE_URL to the verified Search Console property.'],
    }
  }

  const range = buildDateRange(googleConfig.gscLookbackDays, 2)
  const pagePrefix = getSitePathPrefix(site)
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    googleConfig.gscSiteUrl,
  )}/searchAnalytics/query`
  const basePayload = {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: pagePrefix,
          },
        ],
      },
    ],
  }

  try {
    const [totals, queries] = await Promise.all([
      fetchGoogleJson(endpoint, basePayload, [
        'https://www.googleapis.com/auth/webmasters.readonly',
      ]),
      fetchGoogleJson(
        endpoint,
        {
          ...basePayload,
          dimensions: ['query'],
          rowLimit: 25000,
        },
        ['https://www.googleapis.com/auth/webmasters.readonly'],
      ),
    ])

    const totalsRow = totals.rows?.[0] ?? null
    const queryRows = queries.rows ?? []
    const status = totalsRow || queryRows.length > 0 ? 'live' : 'no_data'

    return {
      status,
      impressions: Math.round(totalsRow?.impressions ?? 0),
      clicks: Math.round(totalsRow?.clicks ?? 0),
      ctr: round(totalsRow?.ctr ?? 0, 4),
      avgPosition: round(totalsRow?.position ?? 100, 1),
      queryCount: queryRows.length,
      top50KeywordCount: queryRows.filter(
        (row) => Number(row.position ?? 100) <= 50,
      ).length,
      top20KeywordCount: queryRows.filter(
        (row) => Number(row.position ?? 100) <= 20,
      ).length,
      notes:
        status === 'no_data'
          ? [
              `GSC returned no rows for ${pagePrefix} across ${googleConfig.gscLookbackDays} days yet.`,
            ]
          : [],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown GSC error',
      notes: [
        `GSC request failed for ${pagePrefix}; Gate 3 is falling back to heuristic ranking signals.`,
      ],
    }
  }
}

async function fetchGa4SiteMetrics(site) {
  if (!googleMonitoringEnabled()) {
    return {
      status: 'disabled',
      notes: ['MONITORING_MODE=heuristic_forecast, so GA4 live monitoring is disabled.'],
    }
  }

  if (!hasAnyGoogleAuth()) {
    return {
      status: 'missing_credentials',
      notes: [getGoogleAuthMissingNote()],
    }
  }

  if (!googleConfig.ga4PropertyId) {
    return {
      status: 'missing_config',
      notes: ['Set GA4_PROPERTY_ID to the Analytics property that tracks this site.'],
    }
  }

  const range = buildDateRange(googleConfig.ga4LookbackDays)
  const pagePrefix = getSitePathPrefix(site)
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${googleConfig.ga4PropertyId}:runReport`

  try {
    const [sessionsReport, conversionsReport, revenueReport] = await Promise.all([
      fetchGoogleJson(
        endpoint,
        {
          dateRanges: [range],
          dimensions: [{ name: 'landingPagePlusQueryString' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            filter: {
              fieldName: 'landingPagePlusQueryString',
              stringFilter: {
                matchType: 'BEGINS_WITH',
                value: pagePrefix,
              },
            },
          },
          limit: '250',
        },
        ['https://www.googleapis.com/auth/analytics.readonly'],
      ),
      fetchGoogleJson(
        endpoint,
        {
          dateRanges: [range],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            andGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: 'pagePath',
                    stringFilter: {
                      matchType: 'BEGINS_WITH',
                      value: pagePrefix,
                    },
                  },
                },
                {
                  filter: {
                    fieldName: 'eventName',
                    inListFilter: {
                      values: googleConfig.ga4ConversionEvents,
                      caseSensitive: false,
                    },
                  },
                },
              ],
            },
          },
          limit: String(Math.max(googleConfig.ga4ConversionEvents.length, 1)),
        },
        ['https://www.googleapis.com/auth/analytics.readonly'],
      ),
      fetchGoogleJson(
        endpoint,
        {
          dateRanges: [range],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'totalRevenue' }],
          dimensionFilter: {
            filter: {
              fieldName: 'pagePath',
              stringFilter: {
                matchType: 'BEGINS_WITH',
                value: pagePrefix,
              },
            },
          },
          limit: '250',
        },
        ['https://www.googleapis.com/auth/analytics.readonly'],
      ),
    ])

    const sessions = Math.round(sumGoogleMetricRows(sessionsReport.rows))
    const conversions = Math.round(sumGoogleMetricRows(conversionsReport.rows))
    const revenue = sumGoogleMetricRows(revenueReport.rows)
    const status =
      sessions > 0 || conversions > 0 || revenue > 0 ? 'live' : 'no_data'

    return {
      status,
      sessions,
      conversions,
      revenue,
      notes:
        status === 'no_data'
          ? [
              `GA4 returned no sessions or conversion events for ${pagePrefix} across ${googleConfig.ga4LookbackDays} days yet.`,
            ]
          : [],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown GA4 error',
      notes: [
        `GA4 request failed for ${pagePrefix}; Gate 3 is falling back to heuristic conversion signals.`,
      ],
    }
  }
}

function inferSearchIntent(keyword) {
  const lower = keyword.toLowerCase()
  if (/\b(vs|compare|alternative|alternatives|best)\b/.test(lower)) {
    return 'compare'
  }
  if (/\b(price|pricing|buy|deal)\b/.test(lower)) {
    return 'buy'
  }
  if (/\b(ai|agent|agents|copilot|tool|app|workflow|workflows|labs|video)\b/.test(lower)) {
    return 'tool'
  }
  return 'info'
}

function inferTheme(keyword, categoryHint = '') {
  const lower = keyword.toLowerCase()
  if (categoryHint && themePresets[categoryHint]) {
    return categoryHint
  }
  if (/\b(agent|agents|labs|orchestr|runtime)\b/.test(lower)) {
    return 'agent-infrastructure'
  }
  if (/\b(veo|video|image to video|text to video|prompt)\b/.test(lower)) {
    return 'video-creation'
  }
  if (/\b(meeting|note|copilot|onboarding|assistant|ops)\b/.test(lower)) {
    return 'productivity-ai'
  }
  if (/\b(sdr|outbound|lead|sales)\b/.test(lower)) {
    return 'revenue-automation'
  }
  return 'general-explainers'
}

function inferFreshness(rank) {
  if (rank <= 2) return 'breaking'
  if (rank <= 6) return 'rising'
  return 'evergreen'
}

function isLikelyNoise(keyword) {
  const lower = keyword.toLowerCase()
  return (
    /\b(vs)\b/.test(lower) ||
    /\b(news|weather|earthquake|lottery|obituary)\b/.test(lower) ||
    /\b(phillies|giants|cbs|gma|fc|basketball|soccer)\b/.test(lower) ||
    /^[a-z\s]+$/.test(lower) && lower.split(' ').length === 1
  )
}

function buildKeywordVariants(keyword) {
  const base = keyword.toLowerCase()
  return dedupe([
    base,
    `${base} pricing`,
    `${base} alternatives`,
    `${base} setup guide`,
    `${base} workflow`,
  ])
}

function buildSupportIdeas(topic) {
  const ideas = topic.supportPageIdeas ?? []
  return dedupe([
    ...ideas,
    `${topic.keyword} alternatives`,
    `${topic.keyword} workflow guide`,
  ])
}

function routingKeywordTokens(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => !routingRules.tokenIgnoreList.includes(token))
}

function buildRoutingTokenSet(values) {
  return dedupe(values.flatMap((value) => routingKeywordTokens(value)))
}

function overlapRatio(sourceTokens, targetTokens) {
  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0
  const target = new Set(targetTokens)
  const shared = sourceTokens.filter((token) => target.has(token)).length
  return round(shared / sourceTokens.length, 2)
}

function intersectionCount(left, right) {
  const rightSet = new Set(right)
  return left.filter((value) => rightSet.has(value)).length
}

function buildOpportunityRoutingTokens(opportunity) {
  return buildRoutingTokenSet([
    opportunity.keyword,
    ...opportunity.keywordVariants,
    ...opportunity.supportPageIdeas,
  ])
}

function buildThesisRoutingTokens(thesis) {
  return buildRoutingTokenSet([
    ...thesis.seedKeywords,
    ...thesis.topicKeywords,
    ...(thesis.keywordBoundary ?? []),
    ...thesis.contentAssets,
    thesis.pinnedPrimaryKeyword,
    thesis.audience,
    thesis.brandBoundary,
  ])
}

function normalizeKeywordKey(value) {
  return compactText(String(value ?? '').toLowerCase(), 200)
}

function usesPinnedPrimaryKeyword(thesis) {
  return thesis.status === 'active' && thesis.primaryKeywordStrategy === 'pinned'
}

function getThesisKeywordBoundary(thesis) {
  return dedupe(
    [
      ...(thesis.keywordBoundary ?? []),
      ...(thesis.seedKeywords ?? []),
      ...(thesis.topicKeywords ?? []),
      thesis.pinnedPrimaryKeyword,
    ].filter(Boolean),
  )
}

function matchesThesisKeywordBoundary(opportunity, thesis) {
  const boundaryKeywords = getThesisKeywordBoundary(thesis)
  if (boundaryKeywords.length === 0) return true

  const exactKeywordMatch = boundaryKeywords.some(
    (keyword) => normalizeKeywordKey(keyword) === normalizeKeywordKey(opportunity.keyword),
  )
  if (exactKeywordMatch) return true

  const boundaryTokens = buildRoutingTokenSet([
    ...boundaryKeywords,
    thesis.brandBoundary,
  ])
  const opportunityTokens = buildOpportunityRoutingTokens(opportunity)
  if (intersectionCount(opportunityTokens, boundaryTokens) >= 2) return true
  if (overlapRatio(opportunityTokens, boundaryTokens) >= 0.18) return true

  return opportunity.supportPageIdeas.some((idea) => {
    const ideaTokens = buildRoutingTokenSet([idea])
    return (
      intersectionCount(ideaTokens, boundaryTokens) >= 2 ||
      overlapRatio(ideaTokens, boundaryTokens) >= routingRules.supportIdeaOverlapRatio
    )
  })
}

function countSupportIdeaMatches(opportunity, thesisTokens) {
  return opportunity.supportPageIdeas.filter((idea) => {
    const ideaTokens = buildRoutingTokenSet([idea])
    return (
      overlapRatio(ideaTokens, thesisTokens) >= routingRules.supportIdeaOverlapRatio ||
      intersectionCount(ideaTokens, thesisTokens) >= 2
    )
  }).length
}

function countContentAssetMatches(opportunityTokens, thesis) {
  return thesis.contentAssets.filter((asset) => {
    const assetTokens = buildRoutingTokenSet([asset])
    return intersectionCount(assetTokens, opportunityTokens) > 0
  }).length
}

function getThemeMonetization(theme) {
  return themePresets[theme]?.monetization ?? []
}

function evaluateRouteAgainstThesis(opportunity, thesis) {
  const opportunityTokens = buildOpportunityRoutingTokens(opportunity)
  const keywordTokensOnly = buildRoutingTokenSet([opportunity.keyword])
  const thesisTokens = buildThesisRoutingTokens(thesis)
  const brandTokens = buildRoutingTokenSet([thesis.brandBoundary, ...thesis.topicKeywords])
  const supportMatches = countSupportIdeaMatches(opportunity, thesisTokens)
  const contentAssetMatches = countContentAssetMatches(opportunityTokens, thesis)
  const monetizationOverlapCount = intersectionCount(
    getThemeMonetization(opportunity.theme),
    thesis.monetization,
  )
  const topicOverlap = overlapRatio(opportunityTokens, thesisTokens)
  const brandOverlap = overlapRatio(keywordTokensOnly, brandTokens)
  const themeMatch = opportunity.theme === thesis.theme
  const keywordBoundaryMatch = matchesThesisKeywordBoundary(opportunity, thesis)

  const breakdown = {
    userOverlap: topicOverlap >= routingRules.minimumTopicOverlapRatio || intersectionCount(opportunityTokens, thesisTokens) >= 3,
    intentOverlap: thesis.intentTypes.includes(opportunity.searchIntent),
    monetizationOverlap: monetizationOverlapCount > 0,
    supportReuse: supportMatches >= routingRules.minimumSupportMatches,
    contentAssetReuse:
      contentAssetMatches >= routingRules.minimumContentAssetMatches || themeMatch,
    brandBoundary:
      brandOverlap >= routingRules.minimumBrandOverlapRatio ||
      (themeMatch && intersectionCount(keywordTokensOnly, brandTokens) >= 2),
    keywordBoundary: usesPinnedPrimaryKeyword(thesis) ? keywordBoundaryMatch : true,
  }

  const hardBlocks = []
  if (
    routingRules.requireThemeMatchForAppend &&
    !themeMatch
  ) {
    hardBlocks.push(`theme mismatch: ${opportunity.theme} -> ${thesis.theme}`)
  }

  if (
    Array.isArray(routingRules.hardBlockThemes?.[thesis.theme]) &&
    routingRules.hardBlockThemes[thesis.theme].includes(opportunity.theme)
  ) {
    hardBlocks.push(`blocked theme pair: ${opportunity.theme} cannot append into ${thesis.theme}`)
  }

  if (usesPinnedPrimaryKeyword(thesis) && !keywordBoundaryMatch) {
    hardBlocks.push(
      `keyword boundary mismatch: ${opportunity.keyword} does not fit the locked cluster around ${thesis.pinnedPrimaryKeyword ?? thesis.label}`,
    )
  }

  const score = Object.values(breakdown).filter(Boolean).length

  return {
    thesisKey: thesis.thesisKey,
    thesisStatus: thesis.status,
    domain: thesis.domain,
    siteSlug: thesis.siteSlug,
    score,
    breakdown,
    hardBlocks,
    metrics: {
      topicOverlap,
      brandOverlap,
      supportMatches,
      contentAssetMatches,
      monetizationOverlapCount,
      keywordBoundaryMatch,
    },
    eligibleForAppend:
      thesis.status === 'active' && hardBlocks.length === 0 && score >= routingRules.appendThreshold,
  }
}

function suggestCandidateKey(opportunity) {
  return `${opportunity.theme}-${opportunity.slug}`.slice(0, 72)
}

function routeOpportunity(opportunity) {
  const routeCandidates = routableTheses
    .map((thesis) => evaluateRouteAgainstThesis(opportunity, thesis))
    .toSorted((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return right.metrics.topicOverlap - left.metrics.topicOverlap
    })
  const bestMatch = routeCandidates[0] ?? null

  if (opportunity.status === 'rejected') {
    return {
      status: 'reject_or_watch',
      matchedThesisKey: bestMatch?.thesisKey ?? null,
      matchedDomain: bestMatch?.domain ?? null,
      score: bestMatch?.score ?? 0,
      hardBlockReasons: bestMatch?.hardBlocks ?? [],
      breakdown: bestMatch?.breakdown ?? null,
      candidateKey: null,
      reasons: ['opportunity itself failed Gate 1, so it should not be routed forward'],
    }
  }

  if (bestMatch?.eligibleForAppend) {
    return {
      status: 'append_existing',
      matchedThesisKey: bestMatch.thesisKey,
      matchedDomain: bestMatch.domain,
      score: bestMatch.score,
      hardBlockReasons: [],
      breakdown: bestMatch.breakdown,
      candidateKey: null,
      reasons: [`append into ${bestMatch.thesisKey} on ${bestMatch.domain ?? 'existing domain'}`],
    }
  }

  if ((bestMatch?.score ?? 0) >= routingRules.candidateThreshold) {
    return {
      status: 'create_candidate',
      matchedThesisKey: bestMatch?.thesisKey ?? null,
      matchedDomain: bestMatch?.domain ?? null,
      score: bestMatch?.score ?? 0,
      hardBlockReasons: bestMatch?.hardBlocks ?? [],
      breakdown: bestMatch?.breakdown ?? null,
      candidateKey:
        bestMatch?.thesisStatus === 'candidate'
          ? bestMatch.thesisKey
          : suggestCandidateKey(opportunity),
      reasons: [
        bestMatch?.thesisStatus === 'candidate'
          ? `matches candidate thesis ${bestMatch.thesisKey}, so keep it in the backlog until that thesis is promoted`
          : bestMatch?.hardBlocks?.length
            ? 'strong enough to keep, but blocked from appending into the current thesis'
            : 'interesting opportunity, but not cohesive enough to append into the current thesis',
      ],
    }
  }

  return {
    status: 'reject_or_watch',
    matchedThesisKey: bestMatch?.thesisKey ?? null,
    matchedDomain: bestMatch?.domain ?? null,
    score: bestMatch?.score ?? 0,
    hardBlockReasons: bestMatch?.hardBlocks ?? [],
    breakdown: bestMatch?.breakdown ?? null,
    candidateKey: null,
    reasons: ['keep on the watchlist or drop it; there is not enough thesis fit yet'],
  }
}

function buildRoutingSummary(opportunities) {
  const appendExisting = opportunities.filter(
    (opportunity) => opportunity.routing.status === 'append_existing',
  )
  const createCandidate = opportunities.filter(
    (opportunity) => opportunity.routing.status === 'create_candidate',
  )
  const rejectOrWatch = opportunities.filter(
    (opportunity) => opportunity.routing.status === 'reject_or_watch',
  )

  return {
    appendExistingCount: appendExisting.length,
    createCandidateCount: createCandidate.length,
    rejectOrWatchCount: rejectOrWatch.length,
    appendByThesis: activeTheses.map((thesis) => ({
      thesisKey: thesis.thesisKey,
      domain: thesis.domain,
      count: appendExisting.filter(
        (opportunity) => opportunity.routing.matchedThesisKey === thesis.thesisKey,
      ).length,
    })),
    candidateBacklog: createCandidate.map((opportunity) => ({
      keyword: opportunity.keyword,
      candidateKey: opportunity.routing.candidateKey,
      theme: opportunity.theme,
      matchedThesisKey: opportunity.routing.matchedThesisKey,
      score: opportunity.routing.score,
      hardBlockReasons: opportunity.routing.hardBlockReasons,
    })),
  }
}

function keywordTokens(keyword) {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) =>
      ![
        'the',
        'and',
        'for',
        'with',
        'from',
        'vs',
        'ai',
        'tool',
        'tools',
        'app',
        'apps',
        'software',
        'assistant',
      ].includes(token),
    )
}

function matchesKeywordTokens(text, keyword) {
  const haystack = text.toLowerCase()
  const tokens = keywordTokens(keyword)
  if (tokens.length === 0) return true
  const matched = tokens.filter((token) => haystack.includes(token)).length
  return matched / tokens.length >= 0.5 || matched >= 2
}

function decodeHtml(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function stripTags(text) {
  return decodeHtml(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function normalizeDuckDuckGoResultUrl(url) {
  const absolute = url.startsWith('//') ? `https:${url}` : url

  try {
    const parsed = new URL(absolute)
    if (parsed.hostname.includes('duckduckgo.com') && parsed.pathname === '/l/') {
      const target = parsed.searchParams.get('uddg')
      if (target) return decodeURIComponent(target)
    }
    return absolute
  } catch {
    return absolute
  }
}

function extractDuckDuckGoResults(html) {
  const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  const snippetMatches = [...html.matchAll(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)]

  return titleMatches.map((match, index) => {
    const url = normalizeDuckDuckGoResultUrl(match[1])
    const title = stripTags(match[2])
    const snippet = stripTags(snippetMatches[index]?.[1] ?? '')
    let domain = ''

    try {
      domain = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      domain = ''
    }

    return { title, url, snippet, domain }
  })
}

function extractBingRssResults(xml) {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]

  return itemMatches.map((match) => {
    const itemXml = match[1]
    const title = stripTags(itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    const url = decodeHtml(itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '')
    const snippet = stripTags(itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '')
    let domain = ''

    try {
      domain = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      domain = ''
    }

    return { title, url, snippet, domain }
  })
}

function isDuckDuckGoBlockPage(html, results) {
  const normalizedTitle = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .trim()
    .toLowerCase()

  return (
    results.length === 0 &&
    (
      normalizedTitle === 'duckduckgo' ||
      /anomaly|automated|unusual traffic|captcha|verify you are human|detected/i.test(html)
    )
  )
}

function filterSearchResults(results, keyword) {
  if (!keyword) return results

  return (results ?? []).filter((result) =>
    matchesKeywordTokens(
      `${result.title ?? ''} ${result.snippet ?? ''} ${result.url ?? ''}`,
      keyword,
    ),
  )
}

async function fetchDuckDuckGoResults(query, limit = 10) {
  try {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: browserSearchHeaders,
      },
    )
    const results = extractDuckDuckGoResults(html)
    return isDuckDuckGoBlockPage(html, results) ? [] : results.slice(0, limit)
  } catch {
    return []
  }
}

async function fetchBingRssResults(query, limit = 10) {
  try {
    const xml = await fetchText(
      `https://www.bing.com/search?format=rss&cc=us&setlang=en-US&mkt=en-US&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': browserSearchHeaders['User-Agent'],
        },
      },
    )

    return extractBingRssResults(xml).slice(0, limit)
  } catch {
    return []
  }
}

async function fetchSearchResults(query, limit = 10, keyword = query) {
  const cacheKey = `${query}::${limit}::${keyword}`
  if (searchResultCache.has(cacheKey)) {
    return searchResultCache.get(cacheKey)
  }

  const pending = (async () => {
    if (firecrawlConfigured()) {
      const firecrawlResults = filterSearchResults(
        await fetchFirecrawlSearchResults(query, limit + 2, keyword),
        keyword,
      )

      if (firecrawlResults.length > 0) {
        return dedupeBy(firecrawlResults, 'url').slice(0, limit)
      }
    }

    const ddgResults = filterSearchResults(
      await fetchDuckDuckGoResults(query, limit + 2),
      keyword,
    )

    if (ddgResults.length > 0) {
      return dedupeBy(ddgResults, 'url').slice(0, limit)
    }

    await sleep(250)

    const bingResults = filterSearchResults(
      await fetchBingRssResults(query, limit + 2),
      keyword,
    )

    return dedupeBy(bingResults, 'url').slice(0, limit)
  })()

  searchResultCache.set(cacheKey, pending)

  try {
    const results = await pending
    searchResultCache.set(cacheKey, Promise.resolve(results))
    return results
  } catch (error) {
    searchResultCache.delete(cacheKey)
    throw error
  }
}

async function fetchDuckDuckGoSuggestions(query) {
  try {
    const data = await fetchJson(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
    )

    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter(Boolean)
    }

    return []
  } catch {
    return []
  }
}

async function fetchGitHubSignals(keyword) {
  const exactQuery = encodeURIComponent(`"${keyword}" in:name,description,readme`)
  const recent30 = isoDaysAgo(30)
  const recent90 = isoDaysAgo(90)

  try {
    const [exact, recent30Data, recent90Data] = await Promise.all([
      fetchJson(
        `https://api.github.com/search/repositories?q=${exactQuery}&sort=updated&order=desc&per_page=5`,
      ),
      fetchJson(
        `https://api.github.com/search/repositories?q=${exactQuery}+created:%3E${recent30}&per_page=5`,
      ),
      fetchJson(
        `https://api.github.com/search/repositories?q=${exactQuery}+created:%3E${recent90}&per_page=5`,
      ),
    ])
    const matchedItems = (exact.items ?? []).filter((item) =>
      matchesKeywordTokens(`${item.full_name ?? ''} ${item.description ?? ''}`, keyword),
    )
    const repoItems = (matchedItems.length > 0 ? matchedItems : exact.items ?? [])
      .slice(0, 4)
      .map((item) => ({
        title: item.full_name,
        url: item.html_url,
        domain: 'github.com',
        snippet:
          item.description ||
          `${item.stargazers_count ?? 0} stars, updated ${item.updated_at ?? 'recently'}`,
      }))

    return {
      status: 'live',
      matchCount: matchedItems.length > 0 ? matchedItems.length : exact.total_count ?? 0,
      topStars: matchedItems[0]?.stargazers_count ?? exact.items?.[0]?.stargazers_count ?? 0,
      recentRepoCount30d: recent30Data.total_count ?? 0,
      recentRepoCount90d: recent90Data.total_count ?? 0,
      topRepo: matchedItems[0]?.full_name ?? exact.items?.[0]?.full_name ?? null,
      items: repoItems,
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'unknown error',
      matchCount: 0,
      topStars: 0,
      recentRepoCount30d: 0,
      recentRepoCount90d: 0,
      topRepo: null,
      items: [],
    }
  }
}

async function fetchHackerNewsSignals(keyword) {
  try {
    const data = await fetchJson(
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=10`,
    )
    const hits = data.hits ?? []
    const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30
    const recentHits = hits.filter((hit) => {
      const createdAt = Date.parse(hit.created_at ?? '')
      return (
        Number.isFinite(createdAt) &&
        createdAt >= thirtyDaysAgo &&
        matchesKeywordTokens(`${hit.title ?? ''} ${hit.story_text ?? ''}`, keyword)
      )
    })

    return {
      status: 'live',
      discussionCount30d: recentHits.length,
      topPoints: Math.max(0, ...recentHits.map((hit) => hit.points ?? 0)),
      topComments: Math.max(0, ...recentHits.map((hit) => hit.num_comments ?? 0)),
      titles: recentHits.slice(0, 3).map((hit) => hit.title).filter(Boolean),
      stories: recentHits.slice(0, 4).map((hit) => {
        const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`
        let domain = 'news.ycombinator.com'
        try {
          domain = hit.url
            ? new URL(hit.url).hostname.replace(/^www\./, '')
            : 'news.ycombinator.com'
        } catch {
          domain = 'news.ycombinator.com'
        }

        return {
          title: hit.title,
          url,
          domain,
          snippet: `${hit.points ?? 0} points, ${hit.num_comments ?? 0} comments`,
        }
      }),
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'unknown error',
      discussionCount30d: 0,
      topPoints: 0,
      topComments: 0,
      titles: [],
      stories: [],
    }
  }
}

async function fetchHuggingFaceSignals(keyword) {
  try {
    const data = await fetchJson(
      `https://huggingface.co/api/models?search=${encodeURIComponent(keyword)}&limit=10`,
    )
    const matched = data.filter((item) =>
      matchesKeywordTokens(`${item.id ?? ''} ${item.pipeline_tag ?? ''}`, keyword),
    )

    return {
      status: 'live',
      modelCount: matched.length ?? 0,
      topDownloads: Math.max(0, ...matched.map((item) => item.downloads ?? 0)),
      topLikes: Math.max(0, ...matched.map((item) => item.likes ?? 0)),
      topModel: matched[0]?.id ?? null,
      items: matched.slice(0, 4).map((item) => ({
        title: item.id,
        url: `https://huggingface.co/${item.id}`,
        domain: 'huggingface.co',
        snippet:
          `${item.pipeline_tag ?? 'model'} · ${item.downloads ?? 0} downloads · ${item.likes ?? 0} likes`,
      })),
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'unknown error',
      modelCount: 0,
      topDownloads: 0,
      topLikes: 0,
      topModel: null,
      items: [],
    }
  }
}

async function fetchSerpCommercialSignals(keyword) {
  const comparisonMarkers = [
    'best',
    'alternatives',
    'alternative',
    'compare',
    'comparison',
    'pricing',
    'review',
    'vs',
    'top ',
  ]

  try {
    const searchResults = await fetchBingRssResults(keyword, 10)
    const results = filterSearchResults(searchResults, keyword).slice(0, 10)

    let commercialResultCount = 0
    const productDomainsSeen = new Set()
    const resultDomains = []

    for (const result of results) {
      try {
        const hostname = new URL(result.url).hostname.replace(/^www\./, '')
        resultDomains.push(hostname)
        const haystack = `${result.title} ${result.url}`.toLowerCase()

        if (
          comparisonDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) ||
          comparisonMarkers.some((marker) => haystack.includes(marker))
        ) {
          commercialResultCount += 1
        }

        if (
          productDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
        ) {
          productDomainsSeen.add(hostname)
        }
      } catch {
        continue
      }
    }

    return {
      status: 'live',
      resultCount: results.length,
      commercialResultCount,
      productResultCount: productDomainsSeen.size,
      topDomains: dedupe(resultDomains).slice(0, 5),
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'unknown error',
      resultCount: 0,
      commercialResultCount: 0,
      productResultCount: 0,
      topDomains: [],
    }
  }
}

function detectYear(text) {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]))
  if (years.length === 0) return null
  return Math.max(...years)
}

function classifyIntent(text) {
  const lower = text.toLowerCase()
  if (/\b(vs|compare|comparison|alternatives|alternative|best|top)\b/.test(lower)) return 'comparison'
  if (/\b(price|pricing|cost|free|paid)\b/.test(lower)) return 'pricing'
  if (/\b(workflow|how to|guide|tutorial|steps|checklist)\b/.test(lower)) return 'workflow'
  if (/\b(prompt|prompts|examples|template|library)\b/.test(lower)) return 'prompt'
  return 'overview'
}

function deriveIntentSet(suggestions, keyword) {
  const seed = [keyword, ...suggestions]
  const intents = []

  for (const query of seed) {
    const intent = classifyIntent(query)
    if (!intents.includes(intent)) intents.push(intent)
  }

  const defaults = ['workflow', 'comparison', 'pricing', 'prompt']
  for (const intent of defaults) {
    if (!intents.includes(intent)) intents.push(intent)
  }

  return intents.slice(0, 4)
}

function toQuestion(query) {
  const clean = query.trim().replace(/\?+$/, '')
  if (/^(how|what|why|when|where|which|can|is|are|does|do)\b/i.test(clean)) {
    return `${clean}?`
  }
  return `How do teams use ${clean}?`
}

async function fetchPublishResearch(keyword) {
  const serpResults = await fetchSearchResults(keyword, 8, keyword)
  await sleep(250)
  const forumResults = await fetchSearchResults(`${keyword} reddit forum quora`, 6, keyword)
  await sleep(250)
  const productResults = await fetchSearchResults(`${keyword} product hunt g2 capterra pricing`, 6, keyword)
  await sleep(250)
  const videoResults = await fetchSearchResults(`${keyword} youtube tutorial walkthrough demo`, 6, keyword)
  const [suggestions, hackerNews] = await Promise.all([
    fetchDuckDuckGoSuggestions(keyword),
    fetchHackerNewsSignals(keyword),
  ])

  const topResults = rankSignalRichItems(serpResults, keyword)
    .slice(0, 5)
    .map((result) => ({
    ...result,
    detectedYear: detectYear(`${result.title} ${result.snippet}`),
    intent: classifyIntent(`${result.title} ${result.snippet}`),
    }))
  const comparisonCoverage = topResults.filter((result) => result.intent === 'comparison').length
  const pricingCoverage = topResults.filter((result) => result.intent === 'pricing').length
  const workflowCoverage = topResults.filter((result) => result.intent === 'workflow').length
  const outdatedResultCount = topResults.filter((result) => {
    if (result.detectedYear == null) return false
    return result.detectedYear <= new Date().getUTCFullYear() - 1
  }).length

  const communityPainResults = dedupeBy(
    rankSignalRichItems(
      [
        ...forumResults
          .filter((result) => communityDomains.has(result.domain))
          .filter((result) =>
            /\b(problem|issue|help|best|how|need|struggle|workflow|prompt|results|comparison)\b/i.test(
              `${result.title} ${result.snippet}`,
            ),
          )
          .map((result) => ({
            ...result,
            detectedYear: detectYear(`${result.title} ${result.snippet}`),
            intent: classifyIntent(`${result.title} ${result.snippet}`),
          })),
        ...(hackerNews.stories ?? []).map((story) => ({
          ...story,
          detectedYear: null,
          intent: classifyIntent(`${story.title} ${story.snippet}`),
        })),
      ],
      keyword,
      { dropLowSignal: true },
    ),
    'url',
  ).slice(0, 4)

  const productSignals = dedupeBy(
    rankSignalRichItems(
      productResults
        .filter((result) => looksLikeProductSource(result) || looksLikeComparisonSource(result))
        .map((result) => ({
          ...result,
          detectedYear: detectYear(`${result.title} ${result.snippet}`),
          intent: classifyIntent(`${result.title} ${result.snippet}`),
        })),
      keyword,
      { dropLowSignal: true },
    ),
    'url',
  ).slice(0, 4)

  const videoSignals = dedupeBy(
    rankSignalRichItems(
      videoResults
        .filter((result) => looksLikeVideoWorkflowSource(result) || looksLikeWorkflowSource(result))
        .map((result) => ({
          ...result,
          detectedYear: detectYear(`${result.title} ${result.snippet}`),
          intent: classifyIntent(`${result.title} ${result.snippet}`),
        })),
      keyword,
      { dropLowSignal: true },
    ),
    'url',
  ).slice(0, 4)

  const realQueries = dedupe(
    [
      ...suggestions.filter((item) => matchesKeywordTokens(item, keyword)),
      ...productSignals.map((item) => item.title).filter(Boolean),
      ...videoSignals.map((item) => item.title).filter(Boolean),
    ].slice(0, 8),
  )
  const gapOpportunities = []
  if (comparisonCoverage === 0) gapOpportunities.push('comparison gap in top SERP results')
  if (pricingCoverage === 0) gapOpportunities.push('pricing gap in top SERP results')
  if (workflowCoverage === 0) gapOpportunities.push('workflow gap in top SERP results')
  if (outdatedResultCount > 0) gapOpportunities.push('outdated results still present in top SERP')
  if (communityPainResults.length > 0) gapOpportunities.push('community questions show unresolved workflow pain')
  if (productSignals.length > 0) gapOpportunities.push('buyers are already comparing real products in public search results')
  if (videoSignals.length > 0) gapOpportunities.push('video/tutorial content shows the workflow is concrete enough to demonstrate')

  return {
    keyword,
    topResults,
    communityPainResults,
    productSignals,
    videoSignals,
    suggestions: realQueries,
    relatedQueries: realQueries,
    topIntents: deriveIntentSet(realQueries, keyword),
    gapSummary: {
      comparisonCoverage,
      pricingCoverage,
      workflowCoverage,
      outdatedResultCount,
      communityPainCount: communityPainResults.length,
      productSignalCount: productSignals.length,
      videoSignalCount: videoSignals.length,
      gapOpportunities,
    },
    faqCandidates: dedupe(
      [
        ...realQueries.map((query) => ({
          question: toQuestion(query),
          source: 'ddg-suggestion',
        })),
        ...communityPainResults.map((result) => ({
          question: toQuestion(result.title),
          source: 'community-thread',
        })),
      ].map((item) => JSON.stringify(item)),
    )
      .map((item) => JSON.parse(item))
      .slice(0, 6),
  }
}

async function enrichTopicWithLiveSignals(topic) {
  const [github, hackerNews, huggingFace, serp] = await Promise.all([
    fetchGitHubSignals(topic.keyword),
    fetchHackerNewsSignals(topic.keyword),
    fetchHuggingFaceSignals(topic.keyword),
    fetchSerpCommercialSignals(topic.keyword),
  ])

  return {
    ...topic,
    liveSignals: {
      github,
      hackerNews,
      huggingFace,
      serp,
    },
  }
}

function evaluateOpportunityGate(topic) {
  const rules = experiment.gateRules.opportunityApproval
  const liveSignals = topic.liveSignals ?? {
    github: { recentRepoCount30d: 0, topStars: 0, matchCount: 0, status: 'missing' },
    hackerNews: { discussionCount30d: 0, topPoints: 0, topComments: 0, status: 'missing' },
    huggingFace: { modelCount: 0, topDownloads: 0, topLikes: 0, status: 'missing' },
    serp: { commercialResultCount: 0, productResultCount: 0, topDomains: [], status: 'missing' },
  }
  const trendEvidence = {
    githubStars: Math.max(topic.githubStars ?? 0, liveSignals.github.topStars ?? 0),
    githubStarGrowth30d: topic.githubStarGrowth30d ?? 0,
    xLikes: topic.xLikes ?? 0,
    discussionCount7d: Math.max(topic.discussionCount7d ?? 0, liveSignals.hackerNews.discussionCount30d ?? 0),
    trend28OverPrev28: topic.trend28OverPrev28 ?? 1,
    multiPeak90d: Boolean(topic.multiPeak90d),
    githubRecentRepos30d: liveSignals.github.recentRepoCount30d ?? 0,
    hnDiscussionCount30d: liveSignals.hackerNews.discussionCount30d ?? 0,
    huggingFaceMatches: liveSignals.huggingFace.modelCount ?? 0,
    huggingFaceTopDownloads: liveSignals.huggingFace.topDownloads ?? 0,
  }
  const commercialEvidence = {
    cpcUsd: topic.cpcUsd ?? 0,
    serpAffiliatePages: Math.max(
      topic.serpAffiliatePages ?? 0,
      liveSignals.serp.commercialResultCount ?? 0,
    ),
    relatedProducts: Math.max(
      topic.relatedProducts ?? 0,
      liveSignals.serp.productResultCount ?? 0,
      (liveSignals.huggingFace.modelCount ?? 0) > 0 ? 1 : 0,
    ),
    serpCommercialResults: liveSignals.serp.commercialResultCount ?? 0,
    serpProductResults: liveSignals.serp.productResultCount ?? 0,
  }
  const supportIdeas = buildSupportIdeas(topic)
  const runtime =
    thesisRuntimeMap.get(topic.categoryHint ?? topic.theme ?? '') ??
    thesisRuntimeMap.get(inferTheme(topic.keyword, topic.categoryHint))
  const supportEvidence = {
    supportPageCount: supportIdeas.length,
    hasConversionAsset: Boolean(runtime?.conversionAssetSystem?.primaryAsset?.title ?? experiment.conversionAsset),
  }

  const trendPass =
    trendEvidence.githubStars >= rules.trend.githubStars ||
    trendEvidence.githubStarGrowth30d >= rules.trend.githubStarGrowth30d ||
    trendEvidence.xLikes >= rules.trend.xLikes ||
    trendEvidence.discussionCount7d >= rules.trend.discussionCount7d ||
    trendEvidence.trend28OverPrev28 >= rules.trend.trend28OverPrev28 ||
    (rules.trend.requireMultiPeak90d && trendEvidence.multiPeak90d) ||
    trendEvidence.githubRecentRepos30d >= rules.liveSignals.githubRecentRepos30d ||
    trendEvidence.hnDiscussionCount30d >= rules.liveSignals.hackerNewsDiscussionCount30d ||
    trendEvidence.huggingFaceMatches >= rules.liveSignals.huggingFaceMatches ||
    trendEvidence.huggingFaceTopDownloads >= rules.liveSignals.huggingFaceTopDownloads

  const commercialPass =
    commercialEvidence.cpcUsd >= rules.commercial.cpcUsd ||
    commercialEvidence.serpAffiliatePages >= rules.commercial.serpAffiliatePages ||
    commercialEvidence.relatedProducts >= rules.commercial.relatedProducts ||
    commercialEvidence.serpCommercialResults >= rules.commercial.serpCommercialResults ||
    commercialEvidence.serpProductResults >= rules.commercial.serpProductResults

  const supportPass =
    supportEvidence.supportPageCount >= rules.support.supportPageCount ||
    (supportEvidence.supportPageCount >= rules.support.supportPageCountWithAsset &&
      supportEvidence.hasConversionAsset)

  const reasons = []
  if (trendEvidence.xLikes >= rules.trend.xLikes) reasons.push('X discussion is above the minimum heat threshold')
  if (trendEvidence.githubStars >= rules.trend.githubStars) reasons.push('open-source adoption is visible from GitHub stars')
  if (trendEvidence.trend28OverPrev28 >= rules.trend.trend28OverPrev28) reasons.push('search interest is rising in the last 28-day window')
  if (trendEvidence.githubRecentRepos30d >= rules.liveSignals.githubRecentRepos30d) reasons.push('GitHub has fresh repo creation around this topic')
  if (trendEvidence.hnDiscussionCount30d >= rules.liveSignals.hackerNewsDiscussionCount30d) reasons.push('Hacker News has current discussion density on this topic')
  if (trendEvidence.huggingFaceMatches >= rules.liveSignals.huggingFaceMatches) reasons.push('Hugging Face has live model activity matching this topic')
  if (commercialEvidence.serpAffiliatePages >= rules.commercial.serpAffiliatePages) reasons.push('SERP already shows monetized comparison intent')
  if (commercialEvidence.serpCommercialResults >= rules.commercial.serpCommercialResults) reasons.push('public SERP shows commercial comparison pages')
  if (commercialEvidence.serpProductResults >= rules.commercial.serpProductResults) reasons.push('public SERP shows real product destinations')
  if (commercialEvidence.relatedProducts >= rules.commercial.relatedProducts) reasons.push('buyers can already spend money in the category')
  if (supportEvidence.supportPageCount >= rules.support.supportPageCount) reasons.push('enough support-page breadth exists for a hub')

  const status = trendPass && commercialPass && supportPass ? 'pass' : trendPass && (commercialPass || supportPass) ? 'watch' : 'fail'

  return {
    status,
    trendPass,
    commercialPass,
    supportPass,
    reasons,
    evidence: {
      trend: trendEvidence,
      commercial: commercialEvidence,
      support: supportEvidence,
      live: liveSignals,
    },
  }
}

function buildRawOpportunity(topic, index) {
  const rank = index + 1
  const searchIntent = inferSearchIntent(topic.keyword)
  const theme = inferTheme(topic.keyword, topic.categoryHint)
  const freshness = inferFreshness(rank)
  const demandProxy = round(seededBetween(`${topic.keyword}:demand`, 46, 91))
  const velocity = round(seededBetween(`${topic.keyword}:velocity`, 1.2, 4.9), 2)
  const opportunityGate = evaluateOpportunityGate(topic)

  return {
    id: slugify(topic.keyword),
    keyword: topic.keyword,
    slug: slugify(topic.keyword),
    source: topic.source,
    region: topic.region ?? 'US',
    categoryHint: topic.categoryHint ?? '',
    theme,
    rank,
    searchIntent,
    freshness,
    demandProxy,
    velocity,
    discoveredAt: config.generatedAt,
    keywordVariants: buildKeywordVariants(topic.keyword),
    supportPageIdeas: buildSupportIdeas(topic),
    topicSignals: {
      githubStars: Math.max(topic.githubStars ?? 0, topic.liveSignals?.github?.topStars ?? 0),
      githubStarGrowth30d: topic.githubStarGrowth30d ?? 0,
      xLikes: topic.xLikes ?? 0,
      discussionCount7d: Math.max(topic.discussionCount7d ?? 0, topic.liveSignals?.hackerNews?.discussionCount30d ?? 0),
      trend28OverPrev28: topic.trend28OverPrev28 ?? 1,
      multiPeak90d: Boolean(topic.multiPeak90d),
      cpcUsd: topic.cpcUsd ?? 0,
      serpAffiliatePages: Math.max(topic.serpAffiliatePages ?? 0, topic.liveSignals?.serp?.commercialResultCount ?? 0),
      relatedProducts: Math.max(
        topic.relatedProducts ?? 0,
        topic.liveSignals?.serp?.productResultCount ?? 0,
        topic.liveSignals?.huggingFace?.modelCount ? 1 : 0,
      ),
      forumPainThreads: topic.forumPainThreads ?? 0,
      outdatedSerpResults: topic.outdatedSerpResults ?? 0,
    },
    liveSignals: topic.liveSignals,
    opportunityGate,
  }
}

function validateOpportunity(raw) {
  const lower = raw.keyword.toLowerCase()
  const intentBoost = raw.searchIntent === 'tool' ? 16 : raw.searchIntent === 'compare' ? 12 : 5
  const themeBoost = raw.theme === 'general-explainers' ? 6 : 18
  const freshnessBoost = raw.freshness === 'breaking' ? 8 : raw.freshness === 'rising' ? 6 : 2
  const noisePenalty = isLikelyNoise(raw.keyword) ? 28 : 0
  const breadthPenalty = lower.split(' ').length === 1 ? 12 : 0

  const commercialFit = clamp(
    round(34 + intentBoost + themeBoost + raw.demandProxy / 3 + freshnessBoost - noisePenalty / 2 - breadthPenalty),
    24,
    96,
  )
  const confidence = clamp(
    round(44 + raw.velocity * 8 + themeBoost / 2 - noisePenalty / 2),
    25,
    96,
  )
  const overallScore = clamp(
    round((commercialFit * 0.52) + (confidence * 0.24) + (raw.demandProxy * 0.24) - noisePenalty),
    18,
    96,
  )

  const reasons = []
  const riskFlags = []

  if (raw.searchIntent === 'tool') reasons.push('tool-shaped query with clear comparison intent')
  if (raw.searchIntent === 'compare') reasons.push('buyers are close to choosing a stack')
  if (raw.freshness !== 'evergreen') reasons.push('fresh enough for a timed launch page')
  if (raw.theme !== 'general-explainers') reasons.push(`fits the ${themePresets[raw.theme].label.toLowerCase()} thesis`)
  reasons.push(...raw.opportunityGate.reasons)
  if (isLikelyNoise(raw.keyword)) riskFlags.push('trend may be newsy or non-commercial')
  if (breadthPenalty > 0) riskFlags.push('keyword is too broad without modifiers')
  if (!raw.opportunityGate.trendPass) riskFlags.push('trend continuity is below the first gate threshold')
  if (!raw.opportunityGate.commercialPass) riskFlags.push('commercial intent evidence is weak')
  if (!raw.opportunityGate.supportPass) riskFlags.push('support-page breadth is not strong enough yet')

  const status =
    overallScore >= config.minOpportunityScore &&
    commercialFit >= config.minCommercialFit &&
    raw.opportunityGate.status === 'pass' &&
    riskFlags.length < 2
      ? 'approved'
      : overallScore >= 52 || raw.opportunityGate.status === 'watch'
        ? 'watch'
        : 'rejected'

  return {
    ...raw,
    commercialFit,
    confidence,
    overallScore,
    riskFlags,
    reasons: dedupe(reasons),
    status,
  }
}

function sourceReadinessScore(opportunity) {
  const serp = opportunity.liveSignals?.serp ?? {}
  const github = opportunity.liveSignals?.github ?? {}
  const hackerNews = opportunity.liveSignals?.hackerNews ?? {}

  return round(
    Math.min(serp.resultCount ?? 0, 4) * 2 +
      Math.min(serp.commercialResultCount ?? 0, 3) * 3 +
      Math.min(serp.productResultCount ?? 0, 2) * 2 +
      Math.min(github.matchCount ?? 0, 2) * 1.5 +
      Math.min(hackerNews.discussionCount30d ?? 0, 4) * 0.5,
    1,
  )
}

function clusterApprovedOpportunities(opportunities) {
  const approvedByThesis = new Map()

  for (const item of opportunities) {
    if (
      item.status !== 'approved' ||
      item.routing?.status !== 'append_existing' ||
      !item.routing.matchedThesisKey
    ) {
      continue
    }

    const thesisKey = item.routing.matchedThesisKey
    if (!approvedByThesis.has(thesisKey)) approvedByThesis.set(thesisKey, [])
    approvedByThesis.get(thesisKey).push(item)
  }

  const clusters = activeTheses
    .map((thesisEntry) => {
      const approved = (approvedByThesis.get(thesisEntry.thesisKey) ?? []).toSorted((left, right) => {
        const rightSelectionScore = right.overallScore + sourceReadinessScore(right)
        const leftSelectionScore = left.overallScore + sourceReadinessScore(left)
        if (rightSelectionScore !== leftSelectionScore) {
          return rightSelectionScore - leftSelectionScore
        }
        return right.overallScore - left.overallScore
      })

      if (approved.length === 0) return null

      const runtime = thesisRuntimeMap.get(thesisEntry.thesisKey) ?? buildThesisRuntime(thesisEntry)
      const pinnedPrimaryKeyword =
        runtime.primaryKeywordStrategy === 'pinned'
          ? runtime.pinnedPrimaryKeyword ?? approved[0]?.keyword ?? null
          : null
      const primaryKeyword = pinnedPrimaryKeyword ?? approved[0].keyword
      const primarySlug = slugify(primaryKeyword)
      const support = approved.filter(
        (item) => normalizeKeywordKey(item.keyword) !== normalizeKeywordKey(primaryKeyword),
      )
      const primarySeedTopic = seedTopicMap.get(normalizeKeywordKey(primaryKeyword)) ?? null
      const trackedKeywords = dedupe(
        [
          ...buildKeywordVariants(primaryKeyword),
          ...buildSupportIdeas(
            primarySeedTopic ?? {
              keyword: primaryKeyword,
              supportPageIdeas: [],
            },
          ),
          ...approved.flatMap((item) => [...item.keywordVariants, ...item.supportPageIdeas]),
        ]
          .slice(0, 18),
      )

      return {
        id: runtime.siteSlug,
        slug: runtime.siteSlug,
        thesisKey: thesisEntry.thesisKey,
        theme: thesisEntry.theme,
        label: runtime.label,
        audience: runtime.audience,
        offer: runtime.offer,
        monetization: runtime.monetization,
        leadMagnet: runtime.leadMagnet,
        ctaLabel: runtime.ctaLabel,
        expansionIdeas: runtime.expansionIdeas,
        primaryKeyword,
        primarySlug,
        primaryKeywordStrategy: runtime.primaryKeywordStrategy,
        pinnedPrimaryKeyword,
        siteSlug: runtime.siteSlug,
        domainSuggestion: runtime.domain ?? `${runtime.siteSlug}.today`,
        approvedCount: approved.length,
        averageScore: round(
          approved.reduce((sum, item) => sum + item.overallScore, 0) / approved.length,
        ),
        opportunityIds: approved.map((item) => item.id),
        supportKeywords:
          support.length > 0
            ? support.map((item) => item.keyword)
            : (primarySeedTopic?.supportPageIdeas ?? []).slice(0, 4),
        keywordBoundary: runtime.keywordBoundary,
        trackedKeywords,
        opportunities: approved,
        thesisName: runtime.thesisName,
        siteDefinition: runtime.siteDefinition,
        conversionAsset: runtime.conversionAssetSystem.primaryAsset.title,
        conversionAssetSystem: runtime.conversionAssetSystem,
        pageTemplates: runtime.pageTemplates,
      }
    })
    .filter(Boolean)

  const clusterLimit = contentConfig.unattendedMode
    ? Math.max(activeTheses.length, clusters.length)
    : Math.max(config.maxSitesPerRun, 1)

  return clusters.slice(0, clusterLimit)
}

function buildFaqItems(cluster, research) {
  const seededAnswers = {
    workflow:
      'Start with a narrow demo workflow: choose the source asset, choose the model, set the visual goal, and define the output format before you test prompts.',
    comparison:
      'Compare options on output quality, iteration speed, pricing clarity, and how easy they make prompt reuse for repeatable demo content.',
    pricing:
      'Pricing questions usually hide a workflow question underneath them, so answer both cost and operational fit instead of listing numbers alone.',
    prompt:
      'Prompt libraries become useful when they are tied to a real use case like product teasers, feature explainers, or screenshot-to-video sequences.',
    overview:
      'Most visitors need a quick map of the category first, then they want concrete tools, prompts, and a recommended first workflow to try.',
  }

  const fromQueries = research.faqCandidates.map((item) => ({
    question: item.question,
    answer: seededAnswers[classifyIntent(item.question)] ?? seededAnswers.overview,
    source: item.source,
  }))

  const fallback = [
    {
      question: `Why is ${cluster.primaryKeyword} worth a dedicated page right now?`,
      answer: 'Search demand is moving fast enough that people need a quick explanation, a shortlist of options, and a clearer next step before they bounce back to search.',
      source: 'fallback',
    },
    {
      question: `What should a strong ${cluster.label.toLowerCase()} site answer first?`,
      answer: 'It should explain the category, compare the obvious choices, show how to start, and set expectations around pricing and setup cost.',
      source: 'fallback',
    },
  ]

  return [...fromQueries, ...fallback].slice(0, 5)
}

function buildAlternativeRows(cluster, research) {
  const rows = [
    {
      name: cluster.primaryKeyword,
      strength: 'Best fit when the searcher wants the exact topic or product family',
      drawback: 'May be too narrow without adjacent use cases and pricing context',
    },
    {
      name: `${themePresets[cluster.theme].label} template stack`,
      strength: 'Good for operators who need a ready-made checklist before they buy',
      drawback: 'Needs stronger examples to convert cold traffic',
    },
    {
      name: 'Manual workflow + spreadsheet',
      strength: 'Cheapest fallback and useful as a comparison baseline',
      drawback: 'Low leverage once the team scales and repeats the workflow',
    },
  ]

  for (const result of research.topResults.slice(0, 2)) {
    rows.push({
      name: result.domain,
      strength: `Already visible in search for ${cluster.primaryKeyword}`,
      drawback: result.intent === 'comparison' ? 'Competes on comparison framing, so differentiation must be sharper.' : 'Leaves room for a more actionable comparison or workflow angle.',
    })
  }

  for (const keyword of cluster.supportKeywords.slice(0, 2)) {
    rows.push({
      name: keyword,
      strength: 'Useful supporting angle for internal links and decision-stage traffic',
      drawback: 'Needs a sharper angle than the primary page to avoid overlap',
    })
  }

  return rows.slice(0, 4)
}

function buildOriginalAnchors(cluster, research) {
  return [
    `SERP gap summary: ${research.gapSummary.gapOpportunities.join('; ') || 'category still needs a clearer operator-focused decision page'}`,
    `Live query set: ${research.suggestions.slice(0, 3).join(' / ') || cluster.trackedKeywords.slice(0, 3).join(' / ')}`,
    `Conversion asset: ${cluster.conversionAsset ?? experiment.conversionAsset}`,
  ]
}

function detectSourceSubtype(result, category) {
  const combined = `${result.title ?? ''} ${result.url ?? ''} ${result.snippet ?? ''}`.toLowerCase()
  if (/\bpricing|plans?\b/.test(combined)) return 'pricing'
  if (/\bchangelog|release|update\b/.test(combined)) return 'changelog'
  if (/\bapi|docs?|reference|sdk\b/.test(combined)) return 'docs'
  if (/\btemplate|checklist|prompt\b/.test(combined)) return 'asset'
  if (/\bcompare|comparison|alternatives?|vs\b/.test(combined)) return 'comparison'
  if (/\bworkflow|tutorial|guide|walkthrough|demo\b/.test(combined)) return 'workflow'
  return category
}

function sourceCredibilityScore(result, category) {
  let score = 0.42
  if (looksLikeFirstPartyResearchSource({ ...result, category })) score += 0.36
  if (looksLikeCommunitySource(result)) score -= 0.12
  if (looksLikeGenericEditorialResearchSource({ ...result, category })) score -= 0.08
  if (looksLikeProductSource(result)) score += 0.12
  if (looksLikeVideoWorkflowSource(result)) score += 0.08
  if (isResearchNoiseDomain(result.domain)) score -= 0.4
  return clamp(round(score, 2), 0.05, 0.98)
}

function sourceFreshnessScore(result) {
  const detectedYear = result.detectedYear ?? detectYear(`${result.title ?? ''} ${result.snippet ?? ''}`)
  if (!detectedYear) return 0.46
  const delta = new Date().getUTCFullYear() - detectedYear
  if (delta <= 0) return 0.96
  if (delta === 1) return 0.8
  if (delta === 2) return 0.58
  return 0.34
}

function sourceQualityScore(result, category) {
  let score = sourceCredibilityScore(result, category) * 0.58 + sourceFreshnessScore(result) * 0.42
  if (result.firecrawl?.researchQualityScore != null) {
    score = Math.max(score, clamp(result.firecrawl.researchQualityScore, 0, 1))
  }
  return clamp(round(score, 2), 0.05, 0.99)
}

function normalizeSourcePackItems(results, category, query) {
  return dedupeBy(
    (results ?? []).map((result, index) => ({
      id: `${category}-${slugify(`${result.domain ?? category} ${result.title ?? query}`).slice(0, 42) || `${category}-${index + 1}`}-${shortHash(result.url ?? `${query}-${index}`)}`,
      category,
      query,
      title: result.title,
      url: result.url,
      domain: result.domain,
      snippet: result.snippet,
      detectedYear:
        result.detectedYear ?? detectYear(`${result.title ?? ''} ${result.snippet ?? ''}`),
      intent: result.intent ?? classifyIntent(`${result.title ?? ''} ${result.snippet ?? ''}`),
      sourceSubtype: detectSourceSubtype(result, category),
      credibilityScore: sourceCredibilityScore(result, category),
      freshnessScore: sourceFreshnessScore(result),
      sourceQualityScore: sourceQualityScore(result, category),
      collectedAt: config.generatedAt,
      firecrawl: result.firecrawl ?? null,
    })),
    'url',
  )
}

function mergeSourcePackItems(primary, fallback, limit) {
  return dedupeBy(
    [...(primary ?? []), ...(fallback ?? [])].filter((item) => item?.url),
    'url',
  ).slice(0, limit)
}

function normalizeLiveSignalItems(results, category, query) {
  return normalizeSourcePackItems(results ?? [], category, query)
}

function looksLikeCommunitySource(item) {
  return (
    communityDomains.has(item.domain) ||
    /\b(reddit|quora|hacker news|show hn|ask hn|forum|community)\b/i.test(
      `${item.title ?? ''} ${item.url ?? ''} ${item.snippet ?? ''}`,
    )
  )
}

function looksLikeComparisonSource(item) {
  return (
    comparisonDomains.some((domain) => item.domain === domain || item.domain.endsWith(`.${domain}`)) ||
    /\b(alternative|alternatives|compare|comparison|best|pricing|review|vs)\b/i.test(
      `${item.title ?? ''} ${item.snippet ?? ''}`,
    )
  )
}

function looksLikeWorkflowSource(item) {
  return (
    item.intent === 'workflow' ||
    /\b(workflow|guide|tutorial|how to|checklist|template|prompt|examples)\b/i.test(
      `${item.title ?? ''} ${item.snippet ?? ''}`,
    )
  )
}

function looksLikeProductSource(item) {
  return (
    productDomains.some((domain) => item.domain === domain || item.domain.endsWith(`.${domain}`)) ||
    /\b(product hunt|g2|capterra|appsumo|marketplace|software advice|review site)\b/i.test(
      `${item.title ?? ''} ${item.url ?? ''} ${item.snippet ?? ''}`,
    )
  )
}

function looksLikeVideoWorkflowSource(item) {
  return /\b(youtube|video|walkthrough|demo|screen recording|tutorial)\b/i.test(
    `${item.title ?? ''} ${item.url ?? ''} ${item.snippet ?? ''}`,
  )
}

function looksLikeFirstPartyResearchSource(item) {
  const combined = `${item.title ?? ''} ${item.url ?? ''} ${item.snippet ?? ''}`
  if (looksLikeOfficialSource(item)) return true
  if (looksLikeCommunitySource(item) || isResearchNoiseDomain(item.domain)) return false

  return (
    /\b(docs?|help|support|api|pricing|workflow|tutorial|prompt|template|integrat|changelog|release)\b/i.test(
      combined,
    ) &&
    !comparisonDomains.some((domain) => item.domain === domain || item.domain.endsWith(`.${domain}`))
  )
}

function looksLikeGenericEditorialResearchSource(item) {
  const combined = `${item.title ?? ''} ${item.url ?? ''} ${item.snippet ?? ''}`
  return (
    !looksLikeFirstPartyResearchSource(item) &&
    /\b(best|top|compared|comparison|alternatives?|review|tool stack)\b/i.test(combined)
  )
}

function looksLikeOfficialSource(item) {
  return (
    Boolean(item.domain) &&
    !isResearchNoiseDomain(item.domain) &&
    !looksLikeCommunitySource(item) &&
    !looksLikeComparisonSource(item)
  )
}

function buildSourcePackFallbackPool(cluster, research) {
  const allowDeveloperSources = keywordWantsDeveloperSources(
    cluster.primaryKeyword,
    cluster.theme,
  )
  const githubItems = normalizeLiveSignalItems(
    cluster.opportunities.flatMap((item) => item.liveSignals?.github?.items ?? []),
    'official',
    `${cluster.primaryKeyword} github`,
  )
  const huggingFaceItems = normalizeLiveSignalItems(
    cluster.opportunities.flatMap((item) => item.liveSignals?.huggingFace?.items ?? []),
    'official',
    `${cluster.primaryKeyword} huggingface`,
  )
  const hackerNewsItems = normalizeLiveSignalItems(
    cluster.opportunities.flatMap((item) => item.liveSignals?.hackerNews?.stories ?? []),
    'community',
    `${cluster.primaryKeyword} hacker news`,
  )
  const serpItems = normalizeSourcePackItems(research.topResults, 'serp', cluster.primaryKeyword)
  const communityResearchItems = normalizeSourcePackItems(
    research.communityPainResults,
    'community',
    `${cluster.primaryKeyword} community`,
  )
  const productResearchItems = normalizeSourcePackItems(
    research.productSignals,
    'product',
    `${cluster.primaryKeyword} products`,
  )
  const videoResearchItems = normalizeSourcePackItems(
    research.videoSignals,
    'video',
    `${cluster.primaryKeyword} tutorials`,
  )

  return dedupeBy(
    rankSignalRichItems(
      [
      ...serpItems,
      ...communityResearchItems,
      ...productResearchItems,
      ...videoResearchItems,
      ...(allowDeveloperSources ? githubItems : []),
      ...(allowDeveloperSources ? huggingFaceItems : []),
      ...hackerNewsItems,
      ].filter((item) => item?.url),
      cluster.primaryKeyword,
      { dropLowSignal: false },
    ),
    'url',
  )
}

function buildSourcePackLiveSignals(cluster) {
  return cluster.opportunities.reduce(
    (summary, opportunity) => ({
      githubTopStars: Math.max(summary.githubTopStars, opportunity.liveSignals?.github?.topStars ?? 0),
      githubRecentRepos30d: Math.max(
        summary.githubRecentRepos30d,
        opportunity.liveSignals?.github?.recentRepoCount30d ?? 0,
      ),
      hackerNewsThreads: Math.max(
        summary.hackerNewsThreads,
        opportunity.liveSignals?.hackerNews?.discussionCount30d ?? 0,
      ),
      huggingFaceMatches: Math.max(
        summary.huggingFaceMatches,
        opportunity.liveSignals?.huggingFace?.modelCount ?? 0,
      ),
      serpCommercialResults: Math.max(
        summary.serpCommercialResults,
        opportunity.liveSignals?.serp?.commercialResultCount ?? 0,
      ),
      serpProductResults: Math.max(
        summary.serpProductResults,
        opportunity.liveSignals?.serp?.productResultCount ?? 0,
      ),
    }),
    {
      githubTopStars: 0,
      githubRecentRepos30d: 0,
      hackerNewsThreads: 0,
      huggingFaceMatches: 0,
      serpCommercialResults: 0,
      serpProductResults: 0,
    },
  )
}

function buildSourcePackQualitySummary(categories) {
  const allItems = Object.values(categories).flatMap((items) => items)
  const averageQuality =
    allItems.reduce((sum, item) => sum + (item.sourceQualityScore ?? 0), 0) / Math.max(allItems.length, 1)
  const firstPartyCount = allItems.filter((item) => looksLikeFirstPartyResearchSource(item)).length
  const freshCount = allItems.filter((item) => (item.freshnessScore ?? 0) >= 0.75).length

  return {
    averageSourceQualityScore: round(averageQuality, 2),
    firstPartyCount,
    freshCount,
    highConfidenceCount: allItems.filter((item) => (item.sourceQualityScore ?? 0) >= 0.72).length,
  }
}

function buildSourcePackCoverageSummary(sourceCounts, research) {
  return {
    officialCoverage: sourceCounts.official,
    competitiveCoverage: sourceCounts.competitive,
    communityCoverage: sourceCounts.community,
    workflowCoverage: sourceCounts.workflow,
    productCoverage: sourceCounts.product ?? 0,
    videoCoverage: sourceCounts.video ?? 0,
    deepResearchCoverage: sourceCounts.deepResearch ?? 0,
    gapOpportunityCount: safeArray(research.gapSummary?.gapOpportunities).length,
    relatedQueryCount: research.relatedQueries?.length ?? research.suggestions?.length ?? 0,
  }
}

function mergeFirecrawlIntoSourceItem(item, firecrawl) {
  if (!firecrawl) return item
  return {
    ...item,
    snippet:
      item.snippet && !isLowSignalText(item.snippet)
        ? item.snippet
        : firecrawl.summary || firecrawl.markdownExcerpt || item.snippet,
    firecrawl,
  }
}

async function enrichSourceItemWithFirecrawl(item, keyword) {
  if (!firecrawlConfigured()) return item
  if (item.firecrawl) return mergeFirecrawlIntoSourceItem(item, item.firecrawl)

  const firecrawl = await scrapeFirecrawlUrl(item.url, keyword)
  return mergeFirecrawlIntoSourceItem(item, firecrawl)
}

function isResearchNoiseDomain(domain) {
  return Boolean(domain) && domainMatchesAny(domain, researchNoiseDomains)
}

function isDeveloperSourceDomain(domain) {
  return Boolean(domain) && domainMatchesAny(domain, developerSourceDomains)
}

function keywordWantsDeveloperSources(keyword, theme = '') {
  if (theme === 'agent-infrastructure') return true

  return /\b(api|sdk|repo|repository|github|developer|devtools?|framework|library|open source|opensource|orchestr|runtime|infra|integration)\b/i.test(
    keyword,
  )
}

function looksLikePreferredEvidenceUrl(url) {
  return /\b(pricing|plan|docs?|guide|template|example|prompt|help|faq|changelog|release|update|compare|comparison|api|integrat)\b/i.test(
    url,
  )
}

function looksLikeBlockedEvidenceUrl(url) {
  return /\b(login|signin|sign-in|signup|sign-up|auth|account|search|category|tag|author|feed|rss|sitemap|privacy|terms|cookie|about|contact|career|jobs|event)\b/i.test(
    url,
  )
}

function collectInternalEvidenceLinks(item, keyword) {
  const origin = safeUrlOrigin(item.url)
  if (!origin || safeArray(item.firecrawl?.links).length === 0) return []
  const requiresStrictKeywordMatch =
    looksLikeGenericEditorialResearchSource(item) || looksLikeComparisonSource(item)

  return dedupe(
    safeArray(item.firecrawl.links)
      .filter((url) => url.startsWith(origin))
      .filter((url) => url !== origin && url !== `${origin}/`)
      .filter((url) => looksLikePreferredEvidenceUrl(url))
      .filter((url) => !looksLikeBlockedEvidenceUrl(url))
      .filter(
        (url) =>
          matchesKeywordTokens(url, keyword) ||
          (!requiresStrictKeywordMatch && !isResearchNoiseDomain(item.domain)),
      )
      .slice(0, 4),
  )
}

function looksLikeBlockedSearchResult(
  item,
  keyword,
  { allowCommunity = false, allowDeveloperSources = true } = {},
) {
  if (!item?.url || !item?.domain) return true
  if (!allowCommunity && looksLikeCommunitySource(item)) return true
  if (isResearchNoiseDomain(item.domain)) return true
  if (!allowDeveloperSources && isDeveloperSourceDomain(item.domain)) return true

  const qualityScore = item.firecrawl?.researchQualityScore
  const combinedText = [
    item.title,
    item.snippet,
    item.firecrawl?.summary,
    item.firecrawl?.markdownExcerpt,
  ]
    .filter(Boolean)
    .join(' ')

  if (looksLikeResearchChromeText(combinedText) && (qualityScore == null || qualityScore < 0.36)) {
    return true
  }

  if (qualityScore != null && qualityScore < 0.12) return true

  return false
}

function scoreFirecrawlMapTarget(item, keyword) {
  let score = scoreSignalItem(item, keyword)
  if (item.category === 'official') score += 0.5
  if (item.category === 'workflow') score += 0.2
  if (item.category === 'competitive') score += 0.06
  if (item.firecrawl?.signals?.pricing?.length) score += 0.18
  if (item.firecrawl?.signals?.workflow?.length) score += 0.12
  if (item.firecrawl?.researchGrade) score += 0.24
  if (looksLikeFirstPartyResearchSource(item)) score += 0.28
  if (looksLikeGenericEditorialResearchSource(item)) score -= 0.22
  if (collectInternalEvidenceLinks(item, keyword).length > 0) score += 0.26
  if (safeUrlHostname(item.url).startsWith('docs.')) score += 0.22
  if (isResearchNoiseDomain(item.domain)) score -= 0.9
  if (looksLikeCommunitySource(item)) score -= 0.6
  if (isDeveloperSourceDomain(item.domain) && !keywordWantsDeveloperSources(keyword)) score -= 0.5
  return round(score, 2)
}

function selectFirecrawlMapTargets(
  items,
  keyword,
  { allowDeveloperSources = true } = {},
) {
  return dedupeBy(
    normalizeCollection(items)
      .filter((item) => safeUrlOrigin(item.url))
      .filter(
        (item) =>
          !looksLikeBlockedSearchResult(item, keyword, {
            allowCommunity: false,
            allowDeveloperSources,
          }),
      )
      .filter((item) => looksLikeOfficialSource(item) || looksLikeComparisonSource(item))
      .map((item) => ({
        origin: safeUrlOrigin(item.url),
        domain: safeUrlHostname(item.url),
        category: item.category,
        seedUrl: item.url,
        firstPartyEvidence: looksLikeFirstPartyResearchSource(item),
        genericEditorial: looksLikeGenericEditorialResearchSource(item),
        score: scoreFirecrawlMapTarget(item, keyword),
        internalLinks: collectInternalEvidenceLinks(item, keyword),
      })),
    'origin',
  )
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 4)
}

function prioritizeDeepResearchTargets(targets) {
  const firstPartyTargets = targets.filter((item) => item.firstPartyEvidence)
  if (firstPartyTargets.length >= 2) {
    return firstPartyTargets.slice(0, 3)
  }

  return [
    ...firstPartyTargets,
    ...targets.filter((item) => !item.firstPartyEvidence && !item.genericEditorial),
    ...targets.filter((item) => item.genericEditorial),
  ].slice(0, 3)
}

function buildMappedResearchSearch(keyword, origin) {
  return origin.includes('github.com')
    ? `${keyword} docs pricing comparison changelog`
    : `${keyword} pricing docs changelog template api guide examples faq`
}

function pickMappedResearchCandidates(origin, urls, keyword) {
  return normalizeCollection(urls)
    .map((item) => {
      const url = typeof item === 'string' ? item : item.url ?? item.href ?? item.link ?? ''
      const title = typeof item === 'object' ? item.title ?? guessTitleFromUrl(url) : guessTitleFromUrl(url)
      const description = typeof item === 'object' ? item.description ?? '' : ''
      return {
        url,
        title,
        description,
      }
    })
    .filter((item) => item.url.startsWith(origin))
    .filter((item) => item.url !== origin && item.url !== `${origin}/`)
    .filter((item) => looksLikePreferredEvidenceUrl(item.url))
    .filter((item) => !looksLikeBlockedEvidenceUrl(item.url))
    .filter((item) => matchesKeywordTokens(`${item.title} ${item.description} ${item.url}`, keyword))
    .map((item) => ({
      ...item,
      score: scoreSignalItem(
        {
          title: item.title,
          snippet: item.description,
          url: item.url,
        },
        keyword,
      ) +
        (/\bpricing|plan|docs?|help|faq|api|workflow|template|prompt|changelog\b/i.test(
          `${item.url} ${item.title}`,
        )
          ? 0.24
          : 0) -
        (/\b(best|top|comparison|compare|alternatives?|review)\b/i.test(
          `${item.url} ${item.title}`,
        ) &&
        !/\bpricing|plan|docs?|help|faq|api\b/i.test(`${item.url} ${item.title}`)
          ? 0.18
          : 0),
    }))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 4)
}

async function buildFirecrawlDeepResearchPages(cluster, sourceItems) {
  if (!firecrawlConfigured()) return []

  const allowDeveloperSources = keywordWantsDeveloperSources(
    cluster.primaryKeyword,
    cluster.theme,
  )
  const rankedTargets = selectFirecrawlMapTargets(sourceItems, cluster.primaryKeyword, {
    allowDeveloperSources,
  })
  const targets = prioritizeDeepResearchTargets(rankedTargets)
  const candidateUrls = []

  for (const target of targets) {
    candidateUrls.push(...safeArray(target.internalLinks))
    const urls = await mapFirecrawlUrls(target.origin, buildMappedResearchSearch(cluster.primaryKeyword, target.origin))
    candidateUrls.push(
      ...pickMappedResearchCandidates(target.origin, urls, cluster.primaryKeyword).map((item) => item.url),
    )
    if (candidateUrls.length >= firecrawlConfig.deepPageLimit * 2) break
  }

  const deepPages = []
  for (const url of dedupe(candidateUrls).slice(0, firecrawlConfig.deepPageLimit)) {
    const firecrawl = await scrapeFirecrawlUrl(url, cluster.primaryKeyword)
    if (!firecrawl) continue

    const signalSummary =
      firecrawl.signals.pricing[0] ??
      firecrawl.signals.workflow[0] ??
      firecrawl.signals.changelog[0] ??
      firecrawl.signals.comparison[0] ??
      firecrawl.summary
    if (
      !signalSummary ||
      !firecrawl.researchGrade ||
      looksLikeResearchNoiseLine(signalSummary) ||
      isResearchNoiseDomain(safeUrlHostname(url))
    ) {
      continue
    }

    deepPages.push({
      id: `deep-research-${slugify(guessTitleFromUrl(url)).slice(0, 36) || 'page'}-${shortHash(url, 8)}`,
      category: 'deep-research',
      query: cluster.primaryKeyword,
      title: firecrawl.title || guessTitleFromUrl(url),
      url,
      domain: safeUrlHostname(url),
      snippet: compactText(signalSummary, 220),
      detectedYear: detectYear(`${firecrawl.title ?? ''} ${signalSummary ?? ''}`),
      intent: classifyIntent(`${firecrawl.title ?? ''} ${signalSummary ?? ''} ${url}`),
      firecrawl,
    })
  }

  return deepPages
}

function mapAgentSourceIds(items) {
  const byUrl = new Map(normalizeCollection(items).map((item) => [item.url, item.id]))
  return (url) => {
    if (!url) return []
    return byUrl.has(url) ? [byUrl.get(url)] : []
  }
}

function mergeResearchDossierSignals(baseItems, agentItems, sourceIdResolver, labelKey = 'label') {
  return dedupeBy(
    [
      ...normalizeCollection(baseItems),
      ...normalizeCollection(agentItems).map((item) => ({
        ...item,
        sourceIds:
          safeArray(item.sourceIds).length > 0
            ? item.sourceIds
            : sourceIdResolver(item.sourceUrl ?? item.url),
      })),
    ].filter((item) => item?.[labelKey] || item?.title || item?.name),
    labelKey,
  )
}

async function enrichSourcePackWithFirecrawl(cluster, sourcePack) {
  if (!firecrawlConfigured()) {
    return {
      ...sourcePack,
      firecrawl: {
        status: firecrawlConfig.enabled ? 'missing_credentials_or_cli' : 'disabled',
        notes: firecrawlConfig.enabled
          ? ['Firecrawl is enabled but missing FIRECRAWL_API_KEY or FIRECRAWL_API_URL.']
          : ['Firecrawl integration is disabled.'],
      },
      firecrawlAgentDossier: null,
    }
  }

  const categories = Object.fromEntries(
    Object.entries(sourcePack.categories).map(([key, items]) => [key, [...items]]),
  )
  const itemsToEnrich = dedupeBy(
    [
      ...categories.official.slice(0, 2),
      ...categories.competitive.slice(0, 2),
      ...categories.community.slice(0, 2),
      ...categories.workflow.slice(0, 2),
      ...safeArray(categories.product).slice(0, 2),
      ...safeArray(categories.video).slice(0, 2),
      ...categories.serp.slice(0, 2),
    ],
    'url',
  )
  const enrichedMap = new Map()

  for (const item of itemsToEnrich) {
    enrichedMap.set(item.url, await enrichSourceItemWithFirecrawl(item, cluster.primaryKeyword))
  }

  for (const [key, items] of Object.entries(categories)) {
    categories[key] = items.map((item) => enrichedMap.get(item.url) ?? item)
  }

  const deepResearch = await buildFirecrawlDeepResearchPages(cluster, [
    ...categories.official,
    ...categories.competitive,
    ...categories.workflow,
    ...safeArray(categories.product),
    ...safeArray(categories.video),
  ])
  categories.deepResearch = deepResearch

  const agentUrls = dedupe(
    [
      ...categories.official.slice(0, 2).map((item) => item.url),
      ...categories.competitive.slice(0, 2).map((item) => item.url),
      ...categories.workflow.slice(0, 2).map((item) => item.url),
      ...safeArray(categories.product).slice(0, 1).map((item) => item.url),
      ...safeArray(categories.video).slice(0, 1).map((item) => item.url),
      ...deepResearch.slice(0, 3).map((item) => item.url),
    ].filter(Boolean),
  ).slice(0, 6)
  const firecrawlAgentDossier = await runFirecrawlResearchAgent(cluster, agentUrls)

  return {
    ...sourcePack,
    sourceCounts: {
      ...sourcePack.sourceCounts,
      deepResearch: deepResearch.length,
    },
    categories,
    qualitySummary: buildSourcePackQualitySummary(categories),
    coverageSummary: buildSourcePackCoverageSummary(
      {
        ...sourcePack.sourceCounts,
        deepResearch: deepResearch.length,
      },
      {
        gapSummary: { gapOpportunities: safeArray(sourcePack.searchSignals?.gapOpportunities) },
        relatedQueries: safeArray(sourcePack.searchSignals?.relatedQueries),
        suggestions: safeArray(sourcePack.searchSignals?.suggestions),
      },
    ),
    firecrawl: {
      status: 'live',
      scrapedSourceCount: [...enrichedMap.values()].filter((item) => item.firecrawl).length,
      deepResearchCount: deepResearch.length,
      agentBacked: Boolean(firecrawlAgentDossier),
      mappedOrigins: prioritizeDeepResearchTargets(
        selectFirecrawlMapTargets(
          [
            ...categories.official,
            ...categories.competitive,
            ...categories.workflow,
            ...safeArray(categories.product),
            ...safeArray(categories.video),
          ],
          cluster.primaryKeyword,
          {
            allowDeveloperSources: keywordWantsDeveloperSources(
              cluster.primaryKeyword,
              cluster.theme,
            ),
          },
        ),
      ).map((item) => item.origin),
      notes: [
        'Firecrawl search is used before the DuckDuckGo/Bing fallback.',
        'Selected source-pack URLs are scraped into structured evidence.',
        'Official and competitive domains are mapped for deeper pricing/docs/changelog pages.',
      ],
    },
    firecrawlAgentDossier,
  }
}

async function buildSourcePack(cluster, research) {
  const keyword = cluster.primaryKeyword
  const limit = contentConfig.sourceResultLimit
  const allowDeveloperSources = keywordWantsDeveloperSources(
    cluster.primaryKeyword,
    cluster.theme,
  )
  const queries = {
    official: `${keyword} official docs pricing`,
    competitive: `${keyword} alternatives compare pricing`,
    community: `${keyword} reddit hacker news quora problem`,
    workflow: `${keyword} workflow tutorial guide example`,
    product: `${keyword} product hunt g2 capterra pricing`,
    video: `${keyword} youtube walkthrough tutorial demo`,
  }

  const officialRaw = await fetchSearchResults(queries.official, limit + 2, keyword)
  await sleep(250)
  const competitiveRaw = await fetchSearchResults(queries.competitive, limit + 2, keyword)
  await sleep(250)
  const communityRaw = await fetchSearchResults(queries.community, limit + 2, keyword)
  await sleep(250)
  const workflowRaw = await fetchSearchResults(queries.workflow, limit + 2, keyword)
  await sleep(250)
  const productRaw = await fetchSearchResults(queries.product, limit + 2, keyword)
  await sleep(250)
  const videoRaw = await fetchSearchResults(queries.video, limit + 2, keyword)

  const fallbackPool = buildSourcePackFallbackPool(cluster, research)
  const official = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        officialRaw.filter(
          (item) =>
            !looksLikeComparisonSource(item) &&
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'official',
      queries.official,
    ),
    fallbackPool.filter(
      (item) =>
        looksLikeOfficialSource(item) &&
        !looksLikeBlockedSearchResult(item, keyword, {
          allowCommunity: false,
          allowDeveloperSources,
        }),
    ),
    limit,
  )
  const competitive = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        competitiveRaw.filter(
          (item) =>
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'competitive',
      queries.competitive,
    ),
    fallbackPool.filter(looksLikeComparisonSource),
    limit,
  )
  const community = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        communityRaw.filter(
          (item) =>
            looksLikeCommunitySource(item) &&
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: true,
              allowDeveloperSources,
            }),
        ),
        keyword,
        { dropLowSignal: true },
      ).slice(0, limit),
      'community',
      queries.community,
    ),
    fallbackPool.filter((item) => looksLikeCommunitySource(item) && !isLowSignalText(item.snippet || item.title)),
    limit,
  )
  const workflow = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        workflowRaw.filter(
          (item) =>
            looksLikeWorkflowSource(item) &&
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'workflow',
      queries.workflow,
    ),
    fallbackPool.filter(
      (item) =>
        looksLikeWorkflowSource(item) &&
        !looksLikeBlockedSearchResult(item, keyword, {
          allowCommunity: false,
          allowDeveloperSources,
        }),
    ),
    limit,
  )
  const product = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        productRaw.filter(
          (item) =>
            (looksLikeProductSource(item) || looksLikeComparisonSource(item)) &&
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'product',
      queries.product,
    ),
    fallbackPool.filter((item) => looksLikeProductSource(item) || looksLikeComparisonSource(item)),
    limit,
  )
  const video = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        videoRaw.filter(
          (item) =>
            looksLikeVideoWorkflowSource(item) &&
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'video',
      queries.video,
    ),
    fallbackPool.filter((item) => looksLikeVideoWorkflowSource(item) || looksLikeWorkflowSource(item)),
    limit,
  )
  const serp = mergeSourcePackItems(
    normalizeSourcePackItems(
      rankSignalRichItems(
        research.topResults.filter(
          (item) =>
            !looksLikeBlockedSearchResult(item, keyword, {
              allowCommunity: false,
              allowDeveloperSources,
            }),
        ),
        keyword,
      ).slice(0, limit),
      'serp',
      keyword,
    ),
    fallbackPool.filter(
      (item) =>
        !looksLikeBlockedSearchResult(item, keyword, {
          allowCommunity: false,
          allowDeveloperSources,
        }),
    ),
    limit,
  )

  const sourcePack = {
    generatedAt: config.generatedAt,
    keyword,
    thesisKey: cluster.thesisKey,
    theme: cluster.theme,
    audience: cluster.audience,
    searchSignals: {
      suggestions: research.suggestions,
      relatedQueries: research.relatedQueries ?? research.suggestions,
      topIntents: research.topIntents,
      gapOpportunities: research.gapSummary.gapOpportunities,
      productSignals: research.productSignals ?? [],
      communityThreads: research.communityPainResults ?? [],
      videoSignals: research.videoSignals ?? [],
    },
    sourceCounts: {
      official: official.length,
      competitive: competitive.length,
      community: community.length,
      workflow: workflow.length,
      product: product.length,
      video: video.length,
      serp: serp.length,
      deepResearch: 0,
    },
    liveSignals: buildSourcePackLiveSignals(cluster),
    categories: {
      official,
      competitive,
      community,
      workflow,
      product,
      video,
      serp,
      deepResearch: [],
    },
  }

  sourcePack.qualitySummary = buildSourcePackQualitySummary(sourcePack.categories)
  sourcePack.coverageSummary = buildSourcePackCoverageSummary(sourcePack.sourceCounts, research)

  return enrichSourcePackWithFirecrawl(cluster, sourcePack)
}

async function maybeGenerateAiPageDraft(page, sourcePack) {
  if (
    contentConfig.aiProvider === 'heuristic' ||
    !contentConfig.aiEndpoint ||
    !contentConfig.aiApiKey ||
    !contentConfig.aiModel
  ) {
    return null
  }

  const prompt = {
    keyword: page.keyword,
    pageType: page.type,
    headline: page.h1,
    audience: sourcePack.audience,
    pageBrief: page.pageBrief
      ? {
          pageGoal: page.pageBrief.pageGoal,
          visitorIntent: page.pageBrief.visitorIntent,
          mustWinQuestions: page.pageBrief.mustWinQuestions,
          requiredSections: page.pageBrief.requiredSections,
          requiredExamples: page.pageBrief.requiredExamples,
          requiredCaveats: page.pageBrief.requiredCaveats,
          failureConditions: page.pageBrief.failureConditions,
          ctaStrategy: page.pageBrief.ctaStrategy,
        }
      : null,
    claimCards: safeArray(page.claimCards).slice(0, 6).map((claim) => ({
      id: claim.id,
      claimKind: claim.claimKind,
      statement: claim.statement,
      whyItMatters: claim.whyItMatters,
      evidence: claim.evidence,
      counterpoint: claim.counterpoint,
      sourceIds: claim.sourceIds,
    })),
    researchDossier: page.researchDossier
      ? {
          pricingSummary: page.researchDossier.pricingSummary,
          changelogSignals: page.researchDossier.changelogSignals,
          communityPainSignals: page.researchDossier.communityPainSignals,
          useCases: page.researchDossier.useCases,
          useCaseModels: safeArray(page.researchDossier.useCaseModels).map((item) => ({
            label: item.label,
            audience: item.audience,
            trigger: item.trigger,
            workflow: item.workflow,
            cta: item.cta?.title,
          })),
          failureModes: page.researchDossier.failureModes,
          competitorPositioning: page.researchDossier.competitorPositioning,
        }
      : null,
    sourcePack: {
      searchSignals: sourcePack.searchSignals,
      categories: Object.fromEntries(
        Object.entries(sourcePack.categories).map(([key, value]) => [
          key,
          value.slice(0, 4).map((item) => ({
            title: item.title,
            domain: item.domain,
            snippet: item.snippet,
            intent: item.intent,
          })),
        ]),
      ),
    },
    instructions: [
      'Return valid JSON only.',
      'Write concise, concrete copy with specific conclusions.',
      'Prefer named tools, explicit workflow steps, dates, counts, or concrete use cases when the evidence provides them.',
      'Use the page brief and claim cards as the primary writing spine before falling back to raw source snippets.',
      'If the evidence is weak, state the limitation instead of smoothing it over with generic advice.',
      'Do not invent prices or product claims that are not grounded in the evidence.',
      'Output keys: intro, sectionNarratives, ctaCopy.',
    ],
  }

  try {
    const response = await fetch(contentConfig.aiEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${contentConfig.aiApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrendSitePipeline/1.0',
      },
      body: JSON.stringify({
        model: contentConfig.aiModel,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a senior SEO content strategist. Return compact JSON only and ground every conclusion in the provided evidence.',
          },
          {
            role: 'user',
            content: JSON.stringify(prompt),
          },
        ],
      }),
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    const rawContent = payload.choices?.[0]?.message?.content
    if (!rawContent) return null
    return JSON.parse(rawContent)
  } catch {
    return null
  }
}

function getContentRulePreset(pageType) {
  return (
    contentRulePresets[pageType] ?? {
      targets: { facts: 3, verdicts: 1, examples: 1, refs: 4 },
      introStrategy: 'specific_context',
      ctaStrategy: 'lead_with_asset',
    }
  )
}

function hasManualReviewSignal(entry) {
  return ['reviewer', 'reviewedAt', 'notes'].some(
    (field) => typeof entry?.[field] === 'string' && entry[field].trim(),
  )
}

function buildManualPatterns(reviewOverrideIndex) {
  const entries = [...(reviewOverrideIndex?.values() ?? [])].filter(hasManualReviewSignal)
  const byPageType = {}

  for (const entry of entries) {
    const pageType = entry.pageType ?? 'unknown'
    if (!byPageType[pageType]) {
      byPageType[pageType] = {
        pageType,
        reviewedPages: 0,
      }
    }

    byPageType[pageType].reviewedPages += 1
  }

  return Object.values(byPageType).map((item) => ({
    ...item,
    guidance: `${titleCase(item.pageType.replaceAll('-', ' '))} pages needed manual review before, so keep intros, verdicts, and CTA copy sharper on the next run.`,
  }))
}

function buildSitePlaybookRule(siteSlug, history, feedback) {
  const siteHistory = buildSiteHistory(history, siteSlug).filter((item) => !item.seeded)
  const latest = siteHistory.at(-1) ?? null
  const feedbackRecommendation = feedback?.siteRecommendations?.find(
    (item) => item.siteSlug === siteSlug,
  )

  let titleStrategy = 'specific_outcome'
  let metaStrategy = 'evidence_first'
  let ctaStrategy = 'balanced'
  let supportingPageStrategy = 'maintain'
  const reasons = []

  if (!latest) {
    reasons.push('No site-level history yet, so keep titles specific and preserve evidence density.')
  } else {
    if (latest.gscStatus === 'no_data' || latest.impressions < 100) {
      supportingPageStrategy = 'coverage_depth'
      reasons.push('Search visibility is still thin, so the next run should bias toward clearer coverage and stronger support pages.')
    }

    if (latest.avgPosition > 15) {
      supportingPageStrategy = 'internal_links'
      reasons.push(`Average position is ${latest.avgPosition}, so support pages and internal linking need more weight.`)
    }

    if (latest.impressions >= 100 && latest.ctr < 0.015) {
      titleStrategy = 'pain_then_outcome'
      metaStrategy = 'query_match'
      reasons.push(`CTR is only ${toPercentString(latest.ctr)}, so titles and descriptions need a tighter promise.`)
    }

    if (latest.clicks >= 40 && latest.conversionRate < 0.03) {
      ctaStrategy = 'low_friction_specific'
      reasons.push(`Conversion rate is ${toPercentString(latest.conversionRate)} despite real click volume, so CTA friction should drop.`)
    } else if (latest.conversions > 0) {
      ctaStrategy = 'preserve_winner'
      reasons.push(`This site already has ${latest.conversions} conversion events, so keep the CTA asset explicit and reusable.`)
    }
  }

  if (
    feedbackRecommendation?.contentActions?.some((action) =>
      /title|description|visual/i.test(action),
    )
  ) {
    titleStrategy = 'pain_then_outcome'
    metaStrategy = 'query_match'
    reasons.push('Previous optimization called for better titles, descriptions, or entry visuals.')
  }

  if (
    feedbackRecommendation?.contentActions?.some((action) =>
      /CTA|lead magnet|conversion/i.test(action),
    )
  ) {
    ctaStrategy = 'low_friction_specific'
    reasons.push('Previous optimization called for a stronger conversion asset or CTA.')
  }

  return {
    siteSlug,
    titleStrategy,
    metaStrategy,
    ctaStrategy,
    supportingPageStrategy,
    reasons: dedupe(reasons),
    guidance:
      reasons[0] ??
      'No negative site-level signal detected, so preserve the current page structure.',
  }
}

function buildContentPlaybook(feedback, history, reviewOverrideIndex, previousPlaybook) {
  const manualPatterns = buildManualPatterns(reviewOverrideIndex)
  const manualPatternMap = new Map(manualPatterns.map((item) => [item.pageType, item]))
  const feedbackSignalMap = new Map(
    (feedback?.pageTypeSignals ?? []).map((item) => [item.pageType, item]),
  )
  const previousRuleMap = new Map(
    (previousPlaybook?.pageTypeRules ?? []).map((item) => [item.pageType, item]),
  )
  const siteSlugs = dedupe(
    [
      ...history.flatMap((run) => run.sites?.map((site) => site.siteSlug) ?? []),
      ...(feedback?.siteRecommendations ?? []).map((item) => item.siteSlug),
    ].filter(Boolean),
  )
  const siteRules = siteSlugs.map((siteSlug) => buildSitePlaybookRule(siteSlug, history, feedback))
  const siteRulesNeedLowerFrictionCtas = siteRules.some(
    (item) => item.ctaStrategy === 'low_friction_specific',
  )
  const siteRulesNeedSharperTitles = siteRules.some(
    (item) => item.titleStrategy === 'pain_then_outcome',
  )
  const pageTypeKeys = dedupe([
    ...Object.keys(contentRulePresets),
    ...(feedback?.pageTypeSignals ?? []).map((item) => item.pageType),
    ...(previousPlaybook?.pageTypeRules ?? []).map((item) => item.pageType),
    ...manualPatterns.map((item) => item.pageType),
  ])

  const pageTypeRules = pageTypeKeys.map((pageType) => {
    const preset = getContentRulePreset(pageType)
    const signal = feedbackSignalMap.get(pageType)
    const previousRule = previousRuleMap.get(pageType)
    const manualPattern = manualPatternMap.get(pageType)
    const reasons = []

    const targetFacts = Math.max(
      preset.targets.facts,
      Math.ceil(signal?.averageFacts ?? 0),
      previousRule?.targets?.facts ?? 0,
    )
    const targetVerdicts = Math.max(
      preset.targets.verdicts,
      Math.ceil(signal?.averageVerdicts ?? 0),
      previousRule?.targets?.verdicts ?? 0,
    )
    const targetExamples = Math.max(
      preset.targets.examples,
      Math.ceil(signal?.averageExamples ?? 0),
      previousRule?.targets?.examples ?? 0,
    )
    const targetRefs = Math.max(
      preset.targets.refs,
      Math.ceil(signal?.averageRefs ?? 0),
      previousRule?.targets?.refs ?? 0,
    )

    if ((signal?.averageFacts ?? 0) < preset.targets.facts) {
      reasons.push(
        `${pageType} pages averaged ${signal?.averageFacts ?? 0} facts, below the target ${preset.targets.facts}.`,
      )
    }

    if ((signal?.averageVerdicts ?? 0) < preset.targets.verdicts) {
      reasons.push(
        `${pageType} pages averaged ${signal?.averageVerdicts ?? 0} verdicts, so next run should make the recommendation sharper.`,
      )
    }

    if ((signal?.averageExamples ?? 0) < preset.targets.examples) {
      reasons.push(
        `${pageType} pages averaged ${signal?.averageExamples ?? 0} examples, so next run should add more concrete scenarios.`,
      )
    }

    if ((signal?.averageRefs ?? 0) < preset.targets.refs) {
      reasons.push(
        `${pageType} pages averaged ${signal?.averageRefs ?? 0} visible refs, so traceability needs reinforcing.`,
      )
    }

    if (manualPattern) {
      reasons.push(manualPattern.guidance)
    }

    if (siteRulesNeedLowerFrictionCtas) {
      reasons.push('At least one active site is asking for a more explicit and lower-friction CTA path.')
    }

    if (siteRulesNeedSharperTitles) {
      reasons.push('At least one active site showed weak CTR, so intros and meta copy should promise a clearer outcome.')
    }

    if (signal?.guidance) {
      reasons.push(signal.guidance)
    }

    return {
      pageType,
      targets: {
        facts: targetFacts,
        verdicts: targetVerdicts,
        examples: targetExamples,
        refs: targetRefs,
      },
      introStrategy:
        manualPattern || siteRulesNeedSharperTitles
          ? 'pain_then_outcome'
          : preset.introStrategy,
      ctaStrategy:
        manualPattern != null
          ? 'manual_reviewed_specificity'
          : siteRulesNeedLowerFrictionCtas
            ? 'low_friction_specific'
            : preset.ctaStrategy,
      evidenceStrategy: targetRefs > preset.targets.refs ? 'extend_sources' : 'balanced',
      manualReviewCount: manualPattern?.reviewedPages ?? 0,
      sourceSignals: {
        averageFacts: signal?.averageFacts ?? 0,
        averageVerdicts: signal?.averageVerdicts ?? 0,
        averageExamples: signal?.averageExamples ?? 0,
        averageRefs: signal?.averageRefs ?? 0,
      },
      guidance:
        reasons[0] ??
        `No negative feedback signal on ${pageType} yet, so preserve the current evidence mix.`,
      reasons: dedupe(reasons),
    }
  })

  return {
    generatedAt: config.generatedAt,
    basedOnFeedbackGeneratedAt: feedback?.generatedAt ?? null,
    basedOnRunCount: history.length,
    globalRules: {
      minFacts: 3,
      minVerdicts: 1,
      minExamples: 1,
      minRefs: 3,
      reviewMode: contentConfig.reviewMode,
      unattendedMode: contentConfig.unattendedMode,
    },
    siteRules,
    manualPatterns,
    pageTypeRules,
  }
}

function buildContentPlaybookIndex(playbook) {
  return {
    pageTypeRuleMap: new Map((playbook?.pageTypeRules ?? []).map((item) => [item.pageType, item])),
    siteRuleMap: new Map((playbook?.siteRules ?? []).map((item) => [item.siteSlug, item])),
  }
}

function ensureTargetItems(existingItems, targetCount, candidates, key) {
  const items = Array.isArray(existingItems) ? [...existingItems] : []
  const seen = new Set(
    items.map((item) => String(item?.[key] ?? item?.title ?? item?.label ?? JSON.stringify(item))),
  )

  for (const candidate of candidates ?? []) {
    const candidateKey = String(
      candidate?.[key] ?? candidate?.title ?? candidate?.label ?? JSON.stringify(candidate),
    )
    if (seen.has(candidateKey)) continue
    items.push(candidate)
    seen.add(candidateKey)
    if (items.length >= targetCount) break
  }

  return items
}

function buildPlaybookExtraFacts(page, context) {
  const sourceIds = page.sourceReferences?.slice(0, 2).map((item) => item.id) ?? []
  const assetTitle = page.assetBinding?.primary?.title ?? context.assetSystem.primaryAsset.title

  if (page.type === 'hub') {
    return [
      {
        label: 'Support depth',
        value: `${context.cluster.supportKeywords.length} support keywords are mapped into comparison, pricing, and workflow paths for this hub.`,
        sourceIds,
      },
      {
        label: 'Primary next step',
        value: `${assetTitle} is the main conversion asset tied to this hub.`,
        sourceIds,
      },
      ...context.signalFacts,
    ]
  }

  if (['alternatives', 'best-tools'].includes(page.type)) {
    return context.shortlistRows.map((row) => ({
      label: row.name,
      value: `${row.bestFor}. ${row.verdict}.`,
      sourceIds: row.sourceIds,
    }))
  }

  if (page.type === 'workflow') {
    return [
      {
        label: 'Pilot shape',
        value: `A useful first pilot for ${context.cluster.primaryKeyword} should have one owner, one source asset, and one publish target.`,
        sourceIds,
      },
      {
        label: 'Prompt coverage',
        value: `${context.promptExamples.length} reusable prompt examples were attached to the workflow page.`,
        sourceIds,
      },
      ...context.signalFacts,
    ]
  }

  if (page.type === 'faq') {
    return [
      {
        label: 'Question set',
        value: `${context.research.faqCandidates.length} real-question candidates fed the FAQ page.`,
        sourceIds,
      },
      {
        label: 'Intent spread',
        value: context.research.topIntents.join(', '),
        sourceIds,
      },
      ...context.signalFacts,
    ]
  }

  if (['pricing', 'free-vs-paid'].includes(page.type)) {
    return [
      ...context.pricingSignals,
      {
        label: 'Upgrade trigger',
        value: 'The right time to pay is when review overhead matters more than experimentation.',
        sourceIds,
      },
      ...context.signalFacts,
    ]
  }

  if (page.type === 'use-cases') {
    return context.useCases.map((item, index) => ({
      label: `Use case ${index + 1}`,
      value: item,
      sourceIds,
    }))
  }

  if (page.type === 'template-kit') {
    return [
      {
        label: context.assetSystem.primaryAsset.title,
        value: context.assetSystem.primaryAsset.summary,
        sourceIds,
      },
      {
        label: 'Delivery model',
        value: 'The kit should ship one first-run asset, one repeat-run checklist, and one comparison worksheet for future decisions.',
        sourceIds,
      },
      ...context.assetSystem.secondaryAssets.map((asset) => ({
        label: asset.title,
        value: asset.summary,
        sourceIds,
      })),
    ]
  }

  if (page.type === 'case-study') {
    return [
      {
        label: 'Before',
        value: `The team had demand around ${context.cluster.primaryKeyword} but no reusable workflow.`,
        sourceIds,
      },
      {
        label: 'After',
        value: `The team left with one shortlist, one workflow, and one asset they could reuse on the next cycle.`,
        sourceIds,
      },
      ...context.signalFacts,
    ]
  }

  return context.signalFacts
}

function buildPlaybookExtraVerdicts(page, context) {
  const sourceIds = page.sourceReferences?.slice(0, 2).map((item) => item.id) ?? []

  if (page.type === 'hub') {
    return [
      {
        title: 'Start with the narrowest repeatable use case',
        detail: `Visitors evaluating ${context.cluster.primaryKeyword} usually need one shortlist, one workflow, and one asset before they need more breadth.`,
        sourceIds,
      },
    ]
  }

  if (['alternatives', 'best-tools'].includes(page.type)) {
    return context.shortlistRows.map((row) => ({
      title: row.name,
      detail: `${row.verdict}. Best for ${row.bestFor.toLowerCase()}.`,
      sourceIds: row.sourceIds,
    }))
  }

  if (page.type === 'workflow') {
    return [
      {
        title: 'Document the review loop inside the workflow',
        detail: 'The page should show who reviews the first draft, what usually fails, and how the next run gets faster.',
        sourceIds,
      },
    ]
  }

  if (page.type === 'pricing') {
    return [
      {
        title: 'Compare operating drag before price tags',
        detail: 'Plan names matter less than review overhead, setup time, and how quickly the output becomes reusable.',
        sourceIds,
      },
    ]
  }

  if (page.type === 'free-vs-paid') {
    return [
      {
        title: 'Stay free for validation, pay for throughput',
        detail:
          'The free workflow path is usually enough for rough validation; the paid workflow path matters once teams need speed, consistency, and reusable template assets.',
        sourceIds,
      },
    ]
  }

  if (page.type === 'use-cases') {
    return [
      {
        title: 'Split the category by job, not by broad persona',
        detail: `Different ${context.cluster.primaryKeyword} jobs deserve different workflows and CTA paths.`,
        sourceIds,
      },
    ]
  }

  if (page.type === 'template-kit') {
    return [
      {
        title: 'The asset should reduce the first-run setup cost',
        detail: `If ${context.assetSystem.primaryAsset.title.toLowerCase()} does not help the first pilot happen faster, the page is not product-shaped enough.`,
        sourceIds,
      },
    ]
  }

  if (page.type === 'case-study') {
    return [
      {
        title: 'Trust comes from the workflow change, not vague ROI language',
        detail: 'The page should show what changed in the decision surface, what got documented, and what the team can now repeat.',
        sourceIds,
      },
    ]
  }

  return []
}

function buildPlaybookExtraExamples(page, context) {
  const primaryAsset = page.assetBinding?.primary?.title ?? context.assetSystem.primaryAsset.title

  if (page.type === 'hub') {
    return [
      {
        title: 'First search visit',
        body: `A visitor lands on the hub, understands which ${context.cluster.primaryKeyword} path fits, and grabs ${primaryAsset.toLowerCase()} instead of reopening five comparison tabs.`,
      },
      {
        title: 'Team handoff',
        body: `An operator forwards the hub and workflow pages to a teammate so the shortlist and next step stay aligned.`,
      },
    ]
  }

  if (['alternatives', 'best-tools'].includes(page.type)) {
    return [
      {
        title: 'Shortlist review',
        body: `A buyer compares one primary option and one fallback, scores time-to-value and review overhead, then uses ${primaryAsset.toLowerCase()} to capture the decision.`,
      },
    ]
  }

  if (page.type === 'workflow') {
    return [
      {
        title: 'Review loop example',
        body: `The first draft is generated from one source asset, reviewed by one owner, and then saved into ${primaryAsset.toLowerCase()} for the second run.`,
      },
    ]
  }

  if (page.type === 'faq') {
    return [
      {
        title: 'High-intent question',
        body: `A visitor asks one narrow workflow or prompt question, gets the answer fast, and then moves to the workflow or template page instead of bouncing.`,
      },
    ]
  }

  if (['pricing', 'free-vs-paid'].includes(page.type)) {
    return [
      {
        title: 'Solo operator',
        body: 'The solo builder stays on the free path while validating demand, then upgrades once repeatable throughput matters.',
      },
      {
        title: 'Small team',
        body: 'A team pays once approvals, collaboration, and version control matter more than raw experimentation.',
      },
    ]
  }

  if (page.type === 'use-cases') {
    return context.useCases.map((item) => ({
      title: item,
      body: `Use ${primaryAsset.toLowerCase()} to turn ${item} into a repeatable first test instead of another generic category read.`,
    }))
  }

  if (page.type === 'template-kit') {
    return [
      {
        title: 'Handoff pack',
        body: `The template kit gives the next teammate a checklist, prompt pack, and comparison worksheet so they can repeat the workflow without fresh research.`,
      },
    ]
  }

  if (page.type === 'case-study') {
    return [
      {
        title: 'Repeat cycle',
        body: `After the first launch, the same shortlist and template asset become the starting point for the next release instead of a new search session.`,
      },
    ]
  }

  return []
}

function buildPlaybookIntro(page, context, introStrategy) {
  if (introStrategy !== 'pain_then_outcome') return page.intro

  const extraLineByType = {
    hub: 'Visitors usually need one clear path from problem to shortlist, not a broad category recap.',
    alternatives: 'The page should help a buyer decide the first click quickly, then explain the fallback path.',
    workflow: 'The winning workflow is the one a team can review, reuse, and hand off after the first pass.',
    faq: 'Most visitors here want one narrow answer and one obvious next step.',
    'best-tools': 'Ranking matters only when the visitor understands why the first option should be first.',
    pricing: 'A strong pricing page explains where workflow cost appears long before a credit card gets entered.',
    'free-vs-paid': 'The useful decision is not free versus paid in theory, but whether the workflow has become real enough to justify spend.',
    'use-cases': 'The strongest examples map the category to a narrow production job and a measurable output.',
    'template-kit': 'The asset should feel immediately usable, not like a vague lead magnet.',
    'case-study': 'What matters is the workflow shift, the reusable asset, and the outcome the team can repeat.',
  }
  const extraLine = extraLineByType[page.type]
  if (!extraLine || page.intro.includes(extraLine)) return page.intro
  return `${page.intro} ${extraLine}`
}

function buildPlaybookCtaCopy(page, context, ctaStrategy) {
  if (!['low_friction_specific', 'manual_reviewed_specificity'].includes(ctaStrategy)) {
    return page.ctaCopy
  }

  const primaryAsset = page.assetBinding?.primary?.title ?? context.assetSystem.primaryAsset.title

  if (['alternatives', 'best-tools', 'pricing', 'free-vs-paid'].includes(page.type)) {
    return `Give decision-stage visitors ${primaryAsset.toLowerCase()} so they can score options in one pass and move without reopening research.`
  }

  if (['workflow', 'template-kit', 'case-study'].includes(page.type)) {
    return `Use ${primaryAsset.toLowerCase()} to run the first production-shaped test, document what worked, and reuse the winning path on the next cycle.`
  }

  return `Offer ${primaryAsset.toLowerCase()} as the fastest next step after the page answers the visitor's question.`
}

function applyContentPlaybook(page, pageRule, siteRule, context) {
  if (!pageRule && !siteRule) return page

  const nextPage = { ...page }
  const targets = pageRule?.targets ?? getContentRulePreset(page.type).targets

  nextPage.keyFacts = ensureTargetItems(
    nextPage.keyFacts,
    targets.facts,
    buildPlaybookExtraFacts(nextPage, context),
    'label',
  )
  nextPage.verdicts = ensureTargetItems(
    nextPage.verdicts,
    targets.verdicts,
    buildPlaybookExtraVerdicts(nextPage, context),
    'title',
  )
  nextPage.examples = ensureTargetItems(
    nextPage.examples,
    targets.examples,
    buildPlaybookExtraExamples(nextPage, context),
    'title',
  )
  nextPage.sourceReferences = ensureTargetItems(
    nextPage.sourceReferences,
    targets.refs,
    nextPage.sourceReferences,
    'id',
  )

  const introStrategy = pageRule?.introStrategy ?? 'specific_context'
  const ctaStrategy = pageRule?.ctaStrategy ?? siteRule?.ctaStrategy ?? 'balanced'
  nextPage.intro = buildPlaybookIntro(nextPage, context, introStrategy)
  nextPage.ctaCopy = buildPlaybookCtaCopy(nextPage, context, ctaStrategy)
  nextPage.playbook = {
    targets,
    introStrategy,
    ctaStrategy,
    guidance: pageRule?.guidance ?? siteRule?.guidance ?? 'No active playbook guidance.',
    reasons: dedupe([...(pageRule?.reasons ?? []), ...(siteRule?.reasons ?? [])]).slice(0, 4),
  }

  return nextPage
}

async function buildPageModels(cluster, research, sourcePack, reviewOverrideIndex, contentPlaybookIndex, wikiSeed = null) {
  const homePath = `/generated-sites/${cluster.siteSlug}/index.html`
  const originalAnchors = [
    ...buildOriginalAnchors(cluster, research),
    `Source pack coverage: official ${sourcePack.sourceCounts.official}, competitive ${sourcePack.sourceCounts.competitive}, community ${sourcePack.sourceCounts.community}, workflow ${sourcePack.sourceCounts.workflow}, product ${sourcePack.sourceCounts.product ?? 0}, video ${sourcePack.sourceCounts.video ?? 0}, deep research ${sourcePack.sourceCounts.deepResearch ?? 0}`,
  ]
  const wikiAssetMap = new Map(
    safeArray(wikiSeed?.assets).map((asset) => [asset.slug, asset]),
  )
  function applyWikiAssetOverride(asset) {
    const override = wikiAssetMap.get(asset.slug)
    const merged = {
      ...asset,
      type: preferMeaningfulText(
        override?.assetKind === 'template_pack' ? 'template' : override?.assetKind,
        asset.type,
      ),
      event: preferMeaningfulText(override?.conversionEvent, asset.event),
      summary: preferMeaningfulText(override?.summary, override?.promise, asset.summary),
      wikiId: preferMeaningfulText(override?.id, asset.wikiId),
      deliveryMode: preferMeaningfulText(override?.deliveryMode, asset.deliveryMode),
      primaryPages: preferMeaningfulList(override?.primaryPages, asset.primaryPages),
      bestPageTypes: preferMeaningfulList(override?.bestPageTypes, asset.bestPageTypes),
      acceptanceStatus: preferMeaningfulText(override?.acceptanceStatus, asset.acceptanceStatus),
      refreshPriority: preferMeaningfulText(override?.refreshPriority, asset.refreshPriority, 'medium'),
    }
    merged.reuseScore = preferFiniteNumber(
      override?.reuseScore,
      asset.reuseScore,
      computeAssetReuseScore(merged),
    )
    return merged
  }
  const assetSystem = {
    primaryAsset: applyWikiAssetOverride(cluster.conversionAssetSystem.primaryAsset),
    secondaryAssets: cluster.conversionAssetSystem.secondaryAssets.map(applyWikiAssetOverride),
  }
  const deepResearchPages = safeArray(sourcePack.categories.deepResearch)
  const sourceReferences = [
    ...sourcePack.categories.official,
    ...sourcePack.categories.competitive,
    ...sourcePack.categories.community,
    ...sourcePack.categories.workflow,
    ...safeArray(sourcePack.categories.product),
    ...safeArray(sourcePack.categories.video),
    ...sourcePack.categories.serp,
    ...deepResearchPages,
  ]
  const sourceRefMap = new Map(sourceReferences.map((item) => [item.id, item]))
  const sharedSourceIds = sourceReferences.slice(0, 2).map((item) => item.id)
  const firecrawlSignalPool = sourceReferences.filter((item) => item.firecrawl)
  const researchGradeFirecrawlPool =
    firecrawlSignalPool.filter(
      (item) =>
        item.firecrawl?.researchGrade ||
        (item.firecrawl?.researchQualityScore ?? 0) >= 0.34,
    ).length > 0
      ? firecrawlSignalPool.filter(
          (item) =>
            item.firecrawl?.researchGrade ||
            (item.firecrawl?.researchQualityScore ?? 0) >= 0.34,
        )
      : firecrawlSignalPool
  function collectFirecrawlSignalEntries(signalKey, limit = 4) {
    return dedupeBy(
      researchGradeFirecrawlPool
        .flatMap((item) =>
          safeArray(item.firecrawl?.signals?.[signalKey]).map((detail) => ({
            label: item.domain || item.title,
            title: item.title,
            detail,
            sourceIds: [item.id],
            sourceUrl: item.url,
            sourceCategory: item.category,
            firstPartyEvidence: looksLikeFirstPartyResearchSource(item),
            genericEditorial: looksLikeGenericEditorialResearchSource(item),
            researchQualityScore: item.firecrawl?.researchQualityScore ?? 0,
          })),
        )
        .filter((item) => item.detail),
      'detail',
    ).slice(0, limit)
  }
  const topCommunity = rankSignalRichItems(sourcePack.categories.community, cluster.primaryKeyword, {
    dropLowSignal: true,
  }).slice(0, 3)
  const topCompetitive = dedupeBy(
    rankSignalRichItems(
      [...sourcePack.categories.official, ...sourcePack.categories.competitive, ...deepResearchPages],
      cluster.primaryKeyword,
    ),
    'domain',
  ).slice(0, 4)
  const useCaseSignalEntries = collectFirecrawlSignalEntries('useCases', 12)
  const useCases = buildResearchUseCases(cluster, useCaseSignalEntries)
  const pricingSignals = dedupeBy(
    [
      ...(() => {
        const firecrawlPricingRows = collectFirecrawlSignalEntries('pricing', 8)
          .filter((item) => looksLikeConcretePricingLine(item.detail))
          .toSorted((left, right) => {
            const leftPriority =
              (left.firstPartyEvidence && left.sourceCategory !== 'competitive' ? 5 : 0) +
              (left.sourceCategory === 'official' ? 3 : 0) +
              (left.sourceCategory === 'deep-research' ? 2 : 0) +
              (left.sourceCategory === 'workflow' ? 1 : 0) -
              (left.genericEditorial ? 3 : 0) +
              (left.researchQualityScore ?? 0)
            const rightPriority =
              (right.firstPartyEvidence && right.sourceCategory !== 'competitive' ? 5 : 0) +
              (right.sourceCategory === 'official' ? 3 : 0) +
              (right.sourceCategory === 'deep-research' ? 2 : 0) +
              (right.sourceCategory === 'workflow' ? 1 : 0) -
              (right.genericEditorial ? 3 : 0) +
              (right.researchQualityScore ?? 0)
            return rightPriority - leftPriority
          })

        const firstPartyRows = firecrawlPricingRows.filter(
          (item) => item.firstPartyEvidence && item.sourceCategory !== 'competitive',
        )
        const nonEditorialRows = firecrawlPricingRows.filter(
          (item) => !item.firstPartyEvidence && !item.genericEditorial,
        )
        const fallbackRows =
          firstPartyRows.length > 0
            ? [
                ...firstPartyRows,
                ...nonEditorialRows.filter((item) => item.sourceCategory !== 'competitive'),
              ]
            : [...nonEditorialRows, ...firecrawlPricingRows.filter((item) => item.genericEditorial)]

        return fallbackRows.slice(0, 6).map((item) => ({
          label: item.label,
          value: item.detail,
          sourceIds: item.sourceIds,
        }))
      })(),
      ...rankSignalRichItems(
        [...sourcePack.categories.official, ...sourcePack.categories.competitive, ...deepResearchPages],
        cluster.primaryKeyword,
      )
        .filter(
          (item) =>
            !(
              item.category === 'competitive' &&
              collectFirecrawlSignalEntries('pricing', 8).some(
                (candidate) =>
                  candidate.firstPartyEvidence && candidate.sourceCategory !== 'competitive',
              )
            ) &&
            !looksLikeGenericEditorialResearchSource(item) &&
            looksLikeConcretePricingLine(
              safeArray(item.firecrawl?.signals?.pricing).at(0) || `${item.title} ${item.snippet}`,
            ),
        )
        .map((item) => ({
          label: item.domain,
          value:
            safeArray(item.firecrawl?.signals?.pricing).find((detail) =>
              looksLikeConcretePricingLine(detail),
            ) ??
            item.snippet ??
            item.title,
          sourceIds: [item.id],
        })),
    ],
    'label',
  ).slice(0, 4)
  const caveats = dedupe([
    ...topCommunity.map((item) =>
      /^\d+\s+points?,\s+\d+\s+comments?$/i.test(item.snippet || '')
        ? `${item.domain} discussions still show buyers want clearer implementation guidance before they commit.`
        : item.snippet || item.title,
    ),
    ...collectFirecrawlSignalEntries('caveats', 4).map((item) => item.detail),
    ...(pricingSignals.length === 0
      ? ['Pricing clarity is still weak in public results, so pages need to explain tradeoffs before visitors bounce.']
      : []),
    'Do not recommend a stack without naming the operational cost, review loop, and failure mode.',
  ])
    .filter((item) => !isLowSignalText(item))
    .slice(0, 4)
  const promptExamples = [
    {
      title: `${cluster.primaryKeyword} prompt starter`,
      body: `Goal: produce a ${cluster.primaryKeyword} asset for ${cluster.audience}. Input: one source asset, one target channel, one conversion goal. Output: a short brief, an execution checklist, and one recommended next step.`,
    },
    {
      title: `${cluster.label} evaluation prompt`,
      body: `Compare 3 options for ${cluster.primaryKeyword} across time-to-value, workflow friction, pricing clarity, and reuse potential. End with one recommended choice and one fallback choice.`,
    },
  ]
  const workflowSteps = [
    {
      title: 'Choose the first production-shaped use case',
      detail: `Start with one narrow use case tied to ${useCases[0] ?? cluster.primaryKeyword}, not the whole category at once.`,
      input: `One concrete job like ${useCases[0] ?? cluster.primaryKeyword}`,
      output: 'A narrow pilot brief with one owner, one channel, and one success metric.',
      owner: 'The operator or marketer responsible for the first live test',
      successMetric: 'A pass/fail definition before any tool or prompt testing starts.',
      failurePoint: 'Trying to solve the entire category in one pass.',
    },
    {
      title: 'Collect the source asset and operating constraints',
      detail: 'Define the input, output, owner, and quality bar before comparing tools or templates.',
      input: 'Source screenshots, stills, launch notes, or the seed prompt plus output constraints.',
      output: 'A short operating brief covering format, reviewer, deadline, and quality threshold.',
      owner: 'The teammate who owns source material and final approval',
      successMetric: 'Everyone can name the input, output, and review bar without reopening search.',
      failurePoint: 'Comparing tools before the team agrees on what “good” looks like.',
    },
    {
      title: 'Shortlist the obvious options',
      detail: `Use ${(topCompetitive.map((item) => item.domain).join(', ') || 'the strongest visible category leaders')} as a starting field, then cut the list by buyer fit.`,
      input: 'One shortlist field plus the highest-risk comparison criteria',
      output: 'A primary option, a fallback option, and one reason each survived the cut.',
      owner: 'The buyer, operator, or builder making the implementation decision',
      successMetric: 'The field collapses to a manageable shortlist instead of another endless tool list.',
      failurePoint: 'Keeping every visible option in play because the page never makes a recommendation.',
    },
    {
      title: 'Run one measurable pilot',
      detail: 'Document baseline effort, first-pass quality, and the exact failure mode you hit in the pilot.',
      input: 'One use case, one shortlist choice, and one defined output format',
      output: 'A reviewed pilot with baseline effort, quality notes, and the first failure mode recorded.',
      owner: 'The person executing and reviewing the first production-shaped test',
      successMetric: 'The team learns where review overhead, rework, or output quality actually breaks down.',
      failurePoint: 'Calling the pilot a success without naming what had to be fixed by hand.',
    },
    {
      title: 'Turn the pilot into a reusable asset',
      detail: `Package the learnings into ${assetSystem.primaryAsset.title} so the next visitor or teammate can start faster.`,
      input: 'The winning prompt flow, checklist notes, or comparison criteria from the pilot',
      output: `${assetSystem.primaryAsset.title} plus one repeat-run checklist or worksheet`,
      owner: 'The teammate who will hand this process to the next operator',
      successMetric: 'The next run starts from an asset instead of from fresh research.',
      failurePoint: 'Leaving the learning inside a single person’s head instead of packaging it.',
    },
  ]
  const shortlistRows = dedupeBy(
    [
      ...topCompetitive.map((item, index) => ({
        name: item.domain,
        bestFor: index === 0
          ? 'Teams that want the fastest path from evaluation to execution'
          : index === 1
            ? 'Visitors who need clearer tradeoffs before they commit'
            : 'Operators comparing fit against an already-shortlisted option',
        notFor:
          caveats[index] ??
          'Not ideal if the buyer still needs category context before comparing tools.',
        verdict:
          index === 0
            ? 'Recommended first shortlist review'
            : index === 1
              ? 'Good second opinion'
              : 'Useful benchmark or fallback',
        pricingSignal:
          pricingSignals[index]?.value ??
          'Public pricing clarity is limited; compare this option with a manual checklist.',
        sourceIds: [item.id],
      })),
      ...buildAlternativeRows(cluster, research).map((row, index) => ({
        name: row.name,
        bestFor: row.strength,
        notFor: row.drawback,
        verdict:
          index === 0
            ? 'Recommended first shortlist review'
            : index === 1
              ? 'Strong supporting option'
              : 'Useful benchmark or fallback',
        pricingSignal:
          pricingSignals[index]?.value ??
          'Use a manual pricing and workflow worksheet before you commit.',
        sourceIds: sharedSourceIds.length > 0 ? [sharedSourceIds[Math.min(index, sharedSourceIds.length - 1)]] : [],
      })),
    ],
    'name',
  ).slice(0, 4)
  const bestFor = [
    `Teams shipping ${cluster.primaryKeyword} content on a recurring basis`,
    `Operators who need ${cluster.offer} before they buy or build`,
    `Buyers comparing time-to-value, implementation burden, and reuse potential`,
  ]
  const notFor = [
    'Visitors who only need a generic definition and are not yet comparing options',
    'Teams without a clear output format, owner, or review loop',
  ]

  function idsFromRefs(items, limit = 2) {
    const ids = items.filter(Boolean).slice(0, limit).map((item) => item.id)
    return ids.length > 0 ? ids : sharedSourceIds.slice(0, limit)
  }

  const useCaseModels = buildResearchUseCaseModels(
    cluster,
    useCases,
    useCaseSignalEntries,
    assetSystem,
    idsFromRefs([...sourcePack.categories.workflow, ...sourcePack.categories.community], 2),
  )

  function buildUseCaseCards(models = useCaseModels.slice(0, 3)) {
    return models.map((model) => {
      const assetFlow = assetRouteMap.get(model.cta.assetSlug)
      return {
        title: model.label,
        audience: model.audience,
        trigger: model.trigger,
        workflow: model.workflow,
        outcome: model.outcome,
        ctaTitle: model.cta.title,
        ctaHref: assetFlow?.landingPath ?? '',
      }
    })
  }

  function buildDecisionPaths() {
    return useCaseModels.slice(0, 3).map((model, index) => {
      const shortlist = shortlistRows[index % Math.max(shortlistRows.length, 1)]
      const assetFlow = assetRouteMap.get(model.cta.assetSlug)
      return {
        title: model.label,
        audience: model.audience,
        trigger: model.trigger,
        workflow: model.workflow,
        recommendation: shortlist
          ? `${shortlist.name}: ${shortlist.verdict}. Best for ${shortlist.bestFor.toLowerCase()}.`
          : `Use ${model.cta.title.toLowerCase()} to capture the first production-shaped evaluation.`,
        watchOut: shortlist?.notFor ?? caveats[0],
        ctaTitle: model.cta.title,
        ctaHref: assetFlow?.landingPath ?? '',
      }
    })
  }

  function extractPricingAnchorSnapshot(anchor) {
    const text = String(anchor?.value ?? '')

    return {
      price: text.match(/\$\d+(?:\.\d+)?/)?.[0] ?? '',
      duration:
        text.match(/\b\d+\s*-\s*\d+\s*min(?:ute)?s?\b/i)?.[0].replace(/\s+/g, ' ') ?? '',
      oneTime: /\bone[-\s]?time payment\b/i.test(text),
      noSubscription: /\bno subscription\b/i.test(text),
    }
  }

  function brandNameFromSource(source) {
    const domain = String(source?.domain ?? '').toLowerCase()
    if (domain.includes('ariaflow')) return 'AriaFlow'
    if (domain.includes('synthesia')) return 'Synthesia'
    if (domain.includes('google')) return 'Google AI Studio'
    const base = domain.split('.')[0] ?? ''
    return titleCase(base.replace(/[-_]+/g, ' '))
  }

  const assetPricingAnchor = pricingSignals[0] ?? null
  const assetAutomationScaleSource = sourcePack.categories.official.find((item) =>
    /\b(90%|autopilot|single workspace|160\+ languages|scale content faster)\b/i.test(
      `${item.title} ${item.snippet}`,
    ),
  ) ?? sourcePack.categories.official.find((item) =>
    /\b(scale|faster|business|studio-quality)\b/i.test(`${item.title} ${item.snippet}`),
  ) ?? null
  const assetBusinessRoiSource = sourcePack.categories.official.find((item) =>
    item.id !== assetAutomationScaleSource?.id &&
    /\b(90%|160\+ languages|time and cost|business)\b/i.test(`${item.title} ${item.snippet}`),
  ) ?? null
  const assetCommunityWorkflowSignal =
    topCommunity.find((item) => /\b(workflow|review|results|best)\b/i.test(`${item.title} ${item.snippet}`)) ??
    topCommunity[0] ??
    null
  const assetPricingAnchorSnapshot = extractPricingAnchorSnapshot(assetPricingAnchor)
  const assetAutomationScaleBrand = brandNameFromSource(assetAutomationScaleSource)
  const assetBusinessRoiBrand = brandNameFromSource(assetBusinessRoiSource)

  function buildAssetLandingIntro(asset) {
    if (asset.slug === 'prompt-pack') {
      return `This prompt pack turns one source asset into a publish-ready short-form demo without reopening search, rebuilding the brief, or improvising the review rubric from zero.`
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return `This checklist makes the second run faster than the first by locking the owner, success metric, and failure point before the pilot drifts into tool sprawl.`
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return `This worksheet helps the buyer cut through vendor sprawl by comparing time-to-value, pricing clarity, workflow drag, and reuse potential on one page.`
    }

    return asset.summary
  }

  function buildAssetEvidenceCards(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        assetPricingAnchorSnapshot.price
          ? {
              label: 'First-pilot cost anchor',
              detail: `A visible public benchmark starts at ${assetPricingAnchorSnapshot.price}${assetPricingAnchorSnapshot.duration ? ` for a ${assetPricingAnchorSnapshot.duration} workflow` : ''}${assetPricingAnchorSnapshot.oneTime ? ', billed one time' : ''}. The prompt pack earns the click only if it shortens review waste on that first pilot.`,
              href: sourceRefMap.get(assetPricingAnchor?.sourceIds?.[0])?.url ?? '',
            }
          : null,
        assetAutomationScaleSource
          ? {
              label: 'Why a prompt pack matters later',
              detail: `${assetAutomationScaleBrand} sells workflow controls like autopilot, scheduling, and one workspace. That is the point where a reusable prompt pack matters more than another blank generation box.`,
              href: assetAutomationScaleSource.url,
            }
          : null,
        assetBusinessRoiSource
          ? {
              label: 'Business-proof standard',
              detail: `${assetBusinessRoiBrand} uses 160+ languages and up to 90% time-and-cost savings as buyer language. The pack should create cleaner inputs for that kind of business workflow, not just prettier prompts.`,
              href: assetBusinessRoiSource.url,
            }
          : null,
        assetCommunityWorkflowSignal
          ? {
              label: 'Operator pain signal',
              detail: 'Operators are still comparing which workflow keeps quality stable as models change. The pack reduces trial-and-error by making the brief, prompt blocks, and review criteria explicit.',
              href: assetCommunityWorkflowSignal.url,
            }
          : null,
      ].filter(Boolean)
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        {
          label: 'Five-step workflow spine',
          detail: `${workflowSteps.length} named workflow checkpoints already exist in the system, each with an owner, success metric, and failure point. The checklist turns that research into a repeatable operating document.`,
        },
        {
          label: 'Review-risk control',
          detail: `${workflowSteps[1]?.title ?? 'Source alignment'} and ${workflowSteps[3]?.title ?? 'pilot review'} are where teams usually lose time. The checklist makes those review thresholds explicit before the next pass.`,
        },
        {
          label: 'Handoff proof',
          detail: `${workflowSteps[4]?.title ?? 'Turn the pilot into a reusable asset'} is already part of the workflow model, which means this asset exists to transfer the process to the next operator instead of trapping it in one person’s head.`,
        },
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        {
          label: 'Shortlist field already exists',
          detail: `${shortlistRows.length} visible options including ${shortlistRows.slice(0, 3).map((row) => row.name).join(', ')} are already in play. The worksheet exists to cut that field down to one first choice and one fallback.`,
        },
        assetPricingAnchorSnapshot.price
          ? {
              label: 'Pricing clarity is still thin',
              detail: `One of the clearest public anchors is still ${assetPricingAnchorSnapshot.price}${assetPricingAnchorSnapshot.duration ? ` for ${assetPricingAnchorSnapshot.duration}` : ''}. The worksheet makes the buyer log hidden cost and review drag instead of trusting fuzzy plan names.`,
              href: sourceRefMap.get(assetPricingAnchor?.sourceIds?.[0])?.url ?? '',
            }
          : null,
        {
          label: 'Commercial comparison beats feature comparison',
          detail: 'The scoring grid forces the buyer to compare workflow friction, upgrade triggers, and reuse potential, which is usually more useful than comparing raw feature lists.',
        },
      ].filter(Boolean)
    }

    return [
      {
        label: 'Concrete delivery',
        detail: `${asset.deliverables.length} deliverables and ${asset.deliverySteps.length} delivery steps make this asset product-shaped rather than decorative.`,
      },
    ]
  }

  function buildAssetScenarioCards(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        {
          title: 'Launch-day demo clip',
          detail: 'Use the hook, screenshot, and transition prompt blocks to turn one feature release into a short-form demo without rebuilding the brief from scratch.',
        },
        {
          title: 'Second release cycle',
          detail: 'Reuse the same prompt matrix and fill the reuse notes so the next launch starts from what already passed review.',
        },
        {
          title: 'Teammate handoff',
          detail: 'Send the review rubric with the prompt pack so the next marketer knows what to preserve, what to tighten, and where the first pass broke down.',
        },
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        {
          title: 'Before tool testing',
          detail: 'Use the checklist to lock one owner, one success metric, and one failure point before the team disappears into vendor tabs.',
        },
        {
          title: 'Before review starts',
          detail: 'Use the source-and-constraints step to define the input, output, reviewer, and threshold before the first draft gets debated in chat.',
        },
        {
          title: 'After the pilot',
          detail: 'Turn the pilot into a reusable asset by logging what passed, what failed, and what the next operator should keep fixed.',
        },
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        {
          title: 'Before vendor calls',
          detail: 'List the 3-4 real options, then score speed, pricing clarity, and workflow fit before anyone starts defending a favorite tool.',
        },
        {
          title: 'When pricing is fuzzy',
          detail: 'Log the visible price anchor, the hidden review cost, and the upgrade trigger so the worksheet captures more than a feature comparison.',
        },
        {
          title: 'When picking first and fallback',
          detail: 'Record one first recommendation, one fallback, and one reason the rest of the field did not make the cut.',
        },
      ]
    }

    return useCaseModels.slice(0, 3).map((model) => ({
      title: model.label,
      detail: `${model.trigger} ${model.outcome}`,
    }))
  }

  function buildAssetFirstActionCards(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        {
          title: 'Copy the first prompt block',
          detail: 'Start with the hook, screenshot, or transition starter that matches the first short-form demo you actually need to ship.',
        },
        {
          title: 'Run one narrow pilot',
          detail: `Keep the first pass scoped to one ${assetPricingAnchorSnapshot.duration || 'short'} output and one reviewer so the pack reveals what still needs manual work.`,
        },
        {
          title: 'Save the delta',
          detail: 'Fill the reuse notes with what changed between the first pass and the publish-ready version so the second run starts cleaner.',
        },
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        {
          title: 'Assign the owner',
          detail: 'Fill the checklist with the person who owns source material, execution, and final approval before any tool testing begins.',
        },
        {
          title: 'Mark the pass/fail line',
          detail: 'Define the success metric and failure point for the first production-shaped pilot before the team debates output quality by instinct.',
        },
        {
          title: 'Record the first failure mode',
          detail: 'As soon as the pilot breaks, log the exact review, rework, or quality issue so the next operator does not rediscover it.',
        },
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        {
          title: 'List the live contenders',
          detail: `Start with ${shortlistRows.slice(0, 3).map((row) => row.name).join(', ')} or the closest equivalents already in your shortlist.`,
        },
        {
          title: 'Score the commercial reality',
          detail: 'Fill the pricing clarity, workflow friction, and hidden-cost columns before anyone ranks the options by feature hype alone.',
        },
        {
          title: 'Lock the first recommendation',
          detail: 'Use the decision log to name the first choice, the fallback, and the exact reason the rest of the field lost.',
        },
      ]
    }

    return asset.deliverySteps.map((item) => ({
      title: item.title,
      detail: item.detail,
    }))
  }

  function buildAssetRequestBullets(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'Immediate markdown download after submit.',
        'Best for short-form product demo, launch update, and screenshot-to-video workflows.',
        'Includes prompt starters, review rubric, and reuse notes for the second run.',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        'Immediate markdown download after submit.',
        'Best when more than one reviewer or operator touches the workflow.',
        'Includes owner, success metric, and failure point across all five workflow steps.',
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        'Immediate markdown download after submit.',
        'Best before paying for a recurring workflow suite or vendor contract.',
        'Includes a scoring grid, decision log, and commercial notes for hidden cost and upgrade triggers.',
      ]
    }

    return [
      'Immediate markdown download after submit.',
      'Built for one concrete workflow instead of a generic lead magnet.',
      'Best used on one pilot before the second run.',
    ]
  }

  function buildAssetFollowUpPageSlugs(asset) {
    if (asset.slug === 'prompt-pack') return ['workflow', 'pricing', 'case-study']
    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return ['alternatives', 'workflow', 'case-study']
    }
    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return ['pricing', 'free-vs-paid', 'alternatives']
    }

    return ['index', 'workflow']
  }

  function buildAssetPreviewItems(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        {
          label: 'Hook + sequence starter',
          detail:
            'A first-pass prompt block for hooks, screenshot sequence, transitions, and CTA framing tailored to the first short-form demo pass.',
        },
        {
          label: 'Pilot scope anchor',
          detail: assetPricingAnchorSnapshot.price
            ? `Use the visible ${assetPricingAnchorSnapshot.price}${assetPricingAnchorSnapshot.duration ? ` / ${assetPricingAnchorSnapshot.duration}` : ''} benchmark to keep the first pass narrow instead of designing an enterprise workflow on day one.`
            : `Keep the first pass narrow: one source asset, one target channel, and one conversion goal.`,
        },
        {
          label: 'Review notes scaffold',
          detail: 'A handoff-ready section for what changed between first pass, review feedback, and publish-ready output.',
        },
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return workflowSteps.slice(0, 3).map((step) => ({
        label: step.title,
        detail: `${step.input} -> ${step.output}`,
      }))
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return shortlistRows.slice(0, 3).map((row) => ({
        label: row.name,
        detail: `${row.bestFor}. Compare against ${row.pricingSignal}`,
      }))
    }

    if (asset.slug === 'stack-shortlist') {
      return shortlistRows.slice(0, 3).map((row) => ({
        label: row.name,
        detail: `${row.verdict}. ${row.bestFor}`,
      }))
    }

    return [
      {
        label: 'Core deliverable',
        detail: asset.summary,
      },
      {
        label: 'Primary job',
        detail: `${cluster.audience} can use this after the first ${cluster.primaryKeyword} pilot.`,
      },
    ]
  }

  function buildAssetDeliverables(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        {
          label: 'Brief intake block',
          detail: 'A one-screen intake for source asset, target channel, conversion goal, reviewer, and publish-ready definition before prompting begins.',
        },
        {
          label: 'Variable prompt matrix',
          detail: 'Prompt blocks for hooks, screenshot sequence, transitions, CTA framing, and variable placeholders that map directly to the first publish-ready short-form demo pass.',
        },
        {
          label: 'Repair prompts',
          detail: 'Fallback prompts for generic output, weak motion, unclear CTA framing, or sequence drift after the first pass.',
        },
        {
          label: 'Review rubric',
          detail: 'A compact QA rubric for clarity, motion quality, sequencing, and CTA placement before the clip leaves review.',
        },
        {
          label: 'Reuse notes',
          detail: 'A fill-in handoff note to capture what changed between launch one and launch two, including the winning angle, reviewer note, and failure point.',
        },
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return workflowSteps.map((step) => ({
        label: step.title,
        detail: `Owner: ${step.owner}. Done when: ${step.successMetric} Failure point: ${step.failurePoint}`,
      }))
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        {
          label: 'Weighted scoring grid',
          detail: 'Score shortlist options on time-to-value, workflow friction, pricing clarity, review drag, and reuse potential with a visible weighting model.',
        },
        {
          label: 'Decision log',
          detail: 'Capture the first recommendation, the fallback, the reject reasons, and the exact trigger for revisiting the decision.',
        },
        {
          label: 'Commercial notes',
          detail: 'Track hidden costs, upgrade trigger, manual review drag, and which unknowns still need proof before signing off.',
        },
        {
          label: 'Filled shortlist example',
          detail: 'A worked example showing how one team narrows the field, rejects weak options, and justifies the first choice.',
        },
      ]
    }

    if (asset.slug === 'stack-shortlist') {
      return [
        {
          label: 'Stack shortlist',
          detail: 'A narrowed field for orchestration, tool-calling, and observability fit.',
        },
        {
          label: 'Tradeoff notes',
          detail: 'Capture what each stack improves, where it adds drag, and who should not pick it.',
        },
      ]
    }

    return [
      {
        label: 'Working asset',
        detail: asset.summary,
      },
      {
        label: 'Delivery note',
        detail: 'A reusable next-step artifact tied to a real workflow instead of a vague download.',
      },
    ]
  }

  function buildAssetUseCaseLabels(asset) {
    return useCaseModels
      .filter((model) => model.cta.assetSlug === asset.slug)
      .map((model) => model.label)
      .slice(0, 4)
  }

  function buildAssetDeliverySteps(asset) {
    return [
      {
        title: 'Pick the use case',
        detail:
          buildAssetUseCaseLabels(asset).slice(0, 2).join(' / ') ||
          `Start from one narrow ${cluster.primaryKeyword} use case.`,
      },
      {
        title: 'Lock the first output',
        detail: `Choose one owner, one channel, and one publish-ready output before you ask ${asset.title.toLowerCase()} to do more than the first pilot.`,
      },
      {
        title: 'Request the asset',
        detail: `Use the landing form to unlock ${asset.title.toLowerCase()} without reopening more research tabs.`,
      },
      {
        title: 'Run the first pass',
        detail: `Apply the asset to one pilot, record what changed in review, and reuse the notes on the next cycle.`,
      },
      {
        title: 'Package the second run',
        detail: `Keep the handoff note, failure point, and winning path inside ${asset.title.toLowerCase()} so the next operator starts cleaner than the first one did.`,
      },
    ]
  }

  function buildAssetInputDefinition(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'One source asset or screenshot sequence',
        'One target channel and publish-ready output format',
        'One conversion goal and one named reviewer',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        'One narrow use case',
        'One owner, one reviewer, and one success metric',
        'One source asset plus the operating constraints that define good output',
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        'Three to four real contenders',
        'One production-shaped use case to evaluate them against',
        'Visible pricing, likely hidden cost, and one reviewer who can veto hype',
      ]
    }

    return ['One concrete workflow, one owner, and one production-shaped next step']
  }

  function buildAssetOutputDefinition(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'A cleaner first-pass brief',
        'Prompt blocks with variables instead of one-off prose',
        'A reviewer-ready note showing what changed between first pass and publish-ready output',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        'A pass/fail workflow the next teammate can inherit',
        'A recorded failure point from the first live pilot',
        'A repeat-run note that makes the second cycle faster than the first',
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        'One first choice',
        'One fallback choice',
        'A written reject reason for every option that did not survive the cut',
      ]
    }

    return ['A reusable next-step artifact tied to a real workflow']
  }

  function buildAssetWatchOuts(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'Do not run a broad prompt before the source asset, target channel, and CTA are fixed.',
        'If the first pass looks generic, repair the hook and sequence before you touch style flourishes.',
        'Do not hand this to the next teammate without saving what changed in review.',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return workflowSteps.map((step) => `${step.title}: ${step.failurePoint}`)
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        'Do not rank vendors by feature hype before pricing clarity and workflow drag are logged.',
        'Do not name a first choice unless the fallback and reject reasons are also written down.',
        'If hidden cost is still unknown, leave the decision provisional instead of pretending the field is clean.',
      ]
    }

    return ['Do not ship the asset unless the first pilot and next step are both explicit.']
  }

  function buildAssetFilledExample(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'Scenario: turn one feature-release screenshot set into a short-form launch demo.',
        'Input: 6 screenshots, one release note, one CTA, one reviewer from product marketing.',
        'Prompt block used: hook + screenshot sequence + CTA framing.',
        'What changed in review: the first pass buried the CTA too late, so the transition prompt was tightened and the final 3 seconds were re-cut.',
        'Second-run note: keep the opening hook structure, but swap the social proof line and final CTA for the next release.',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        'Use case: ship a product update clip for one release, one channel, and one reviewer.',
        'Owner: growth operator. Reviewer: product marketer. Success metric: publish-ready draft in one review cycle.',
        'Failure found in the first pilot: the shortlist was never cut, so review started before the tool decision was finished.',
        'Fix for the second run: lock the shortlist first, then save the winning prompt and review threshold in the checklist handoff note.',
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      const firstOption = shortlistRows[0]?.name ?? 'primary option'
      const secondOption = shortlistRows[1]?.name ?? 'fallback option'
      const rejectedOption = shortlistRows[2]?.name ?? 'rejected option'
      return [
        `First choice: ${firstOption} because it clears the first pilot with lower workflow drag and a clearer path to reuse.`,
        `Fallback: ${secondOption} because it stays viable if the first option breaks on output quality or reviewer expectations.`,
        `Rejected: ${rejectedOption} because the visible value is weaker once hidden review cost and upgrade uncertainty are logged.`,
        'Upgrade trigger: move to the paid workflow only when weekly throughput and review coordination become the real bottleneck.',
      ]
    }

    return ['Filled example not defined yet.']
  }

  function buildAssetSecondRunNotes(asset) {
    if (asset.slug === 'prompt-pack') {
      return [
        'Record the winning hook, where the first pass failed, and which repair prompt fixed it.',
        'Save the approved output shape so the next operator starts from a proven structure, not from a blank box.',
        'Hand off the rubric with the prompts so review standards travel with the asset.',
      ]
    }

    if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      return [
        'Keep one line for what changed between run one and run two.',
        'Name the failure sign the next operator should watch for first.',
        'If ownership changes, update the handoff note before the next live test starts.',
      ]
    }

    if (asset.slug === 'comparison-worksheet' || asset.slug === 'evaluation-worksheet') {
      return [
        'Revisit the worksheet only when pricing, workflow drag, or review overhead changes materially.',
        'Carry the reject reasons forward so the next buyer does not reopen dead options without new evidence.',
        'If the first choice fails the pilot, promote the fallback and record why the swap happened.',
      ]
    }

    return ['Carry the working note forward before the next run begins.']
  }

  function buildAssetMarkdown(asset) {
    const lines = [
      `# ${asset.title}`,
      '',
      asset.summary,
      '',
      '## Best-fit use cases',
      ...formatMarkdownBullets(
        buildAssetUseCaseLabels(asset).length > 0
          ? buildAssetUseCaseLabels(asset)
          : useCaseModels.slice(0, 3).map((model) => model.label),
      ),
      '',
      '## Why this asset exists',
      ...formatMarkdownBullets(
        buildAssetEvidenceCards(asset).slice(0, 4),
        (item) => `${item.label}: ${item.detail}`,
      ),
      '',
      '## What is inside',
      ...formatMarkdownBullets(
        buildAssetDeliverables(asset),
        (item) => `${item.label}: ${item.detail}`,
      ),
      '',
      '## First 30 minutes',
      ...formatMarkdownBullets(
        buildAssetFirstActionCards(asset).slice(0, 4),
        (item) => `${item.title}: ${item.detail}`,
      ),
      '',
      '## Input definition',
      ...formatMarkdownBullets(buildAssetInputDefinition(asset)),
      '',
      '## Output expected',
      ...formatMarkdownBullets(buildAssetOutputDefinition(asset)),
      '',
      '## Workflow anchors',
      ...formatMarkdownBullets(
        workflowSteps.slice(0, 4),
        (step) => `${step.title}: ${step.input} -> ${step.output}`,
      ),
      '',
      '## Failure points / watch-outs',
      ...formatMarkdownBullets(buildAssetWatchOuts(asset)),
      '',
      '## Filled example',
      ...formatMarkdownBullets(buildAssetFilledExample(asset)),
      '',
      '## Second run and handoff',
      ...formatMarkdownBullets(buildAssetSecondRunNotes(asset)),
      '',
      '## Companion pages',
      ...formatMarkdownBullets(buildAssetFollowUpPageSlugs(asset)),
      '',
    ]

    if (asset.slug === 'prompt-pack') {
      lines.push(
        '## Brief intake block',
        '',
        '- Source asset:',
        '- Target channel:',
        '- Conversion goal:',
        '- Reviewer:',
        '- Publish-ready definition:',
        '',
        '## Prompt starters',
        '',
        ...promptExamples.map((item) => `### ${item.title}\n${item.body}\n`),
        '## Repair prompts',
        '',
        '### If the hook is generic',
        'Rewrite the opening 3 seconds to name the workflow outcome, the audience, and the one visible reason this output should earn the next click.',
        '',
        '### If the CTA lands too late',
        'Tighten the sequence so the CTA is previewed earlier and the final beat feels like a decision, not a fade-out.',
        '',
        '## Reviewer rubric',
        '',
        '- Clarity: can a reviewer understand the output without extra explanation?',
        '- Sequence: does the order of frames support the outcome instead of wandering?',
        '- CTA fit: does the CTA appear early enough and clearly enough for the channel?',
        '- Reuse value: can the next teammate run this again without rebuilding the brief?',
      )
    } else if (asset.slug === 'workflow-checklist' || asset.slug === 'benchmark-checklist') {
      lines.push(
        '## Checklist',
        '',
        ...workflowSteps.flatMap((step) => [
          `### ${step.title}`,
          `- [ ] Owner: ${step.owner}`,
          `- [ ] Input: ${step.input}`,
          `- [ ] Output: ${step.output}`,
          `- [ ] Done definition: ${step.successMetric}`,
          `- [ ] Failure sign: ${step.failurePoint}`,
          `- [ ] Fallback action: Pause the next step until ${step.failurePoint.toLowerCase().replace(/\.$/, '')} is resolved.`,
          '',
        ]),
      )
    } else {
      lines.push(
        '## Scoring definitions',
        '',
        '| Dimension | Weight | 1 point | 3 points | 5 points |',
        '| --- | --- | --- | --- | --- |',
        '| Time-to-value | 30 | Slow setup, unclear first output | Usable after setup help | Fast first pilot with little cleanup |',
        '| Workflow friction | 25 | Heavy coordination or unclear handoff | Manageable with some manual cleanup | Smooth handoff and repeat-run flow |',
        '| Pricing clarity | 20 | Fuzzy pricing or unknown limits | Some clarity but hidden tradeoffs remain | Clear pricing, limits, and upgrade path |',
        '| Review drag | 15 | Review overhead dominates output quality gains | Mixed review effort | Review stays lightweight and predictable |',
        '| Reuse potential | 10 | One-off output, hard to repeat | Some reuse with extra cleanup | Easy to repeat across the next cycle |',
        '',
        '## Reject conditions',
        '',
        '- Reject if hidden cost is still unknown after the first scoring pass.',
        '- Reject if review drag is high enough that the workflow would not survive a second run.',
        '- Reject if the option cannot produce a publish-ready pilot without undocumented manual rescue work.',
        '',
        '## Weighted scorecard template',
        '',
        '| Option | Time-to-value | Workflow friction | Pricing clarity | Review drag | Reuse potential | Total |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| Option A |  |  |  |  |  |  |',
        '| Option B |  |  |  |  |  |  |',
        '| Option C |  |  |  |  |  |  |',
        '',
        '## Decision log',
        '',
        '- First choice:',
        '- Fallback:',
        '- Reject reasons:',
        '- Hidden cost still unresolved:',
        '- Upgrade trigger:',
        '- Review drag note:',
        '',
        '## Scorecard seed',
        '',
        '| Option | Best for | Watch-out | Verdict |',
        '| --- | --- | --- | --- |',
        ...shortlistRows
          .slice(0, 4)
          .map((row) => `| ${row.name} | ${row.bestFor} | ${row.notFor} | ${row.verdict} |`),
      )
    }

    return `${lines.join('\n').trim()}\n`
  }

  function deriveAssetAcceptanceMode(assetRoute) {
    const summaryText = `${assetRoute.title} ${assetRoute.summary} ${assetRoute.landingIntro}`.toLowerCase()
    if (
      /consult|audit|affiliate|partner|roi|best choice|best option|guarantee/.test(summaryText) ||
      ['consult_offer', 'partner_clickout'].includes(assetRoute.assetKind)
    ) {
      return 'C'
    }
    if (['template_pack'].includes(assetRoute.assetKind)) {
      return 'B'
    }
    return ['checklist', 'worksheet', 'shortlist'].includes(assetRoute.assetKind) ? 'A' : 'B'
  }

  function evaluateAssetAcceptance(assetRoute) {
    const markdown = assetRoute.downloadMarkdown || ''
    const hasHeading = (heading) =>
      new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(markdown)
    const mode = deriveAssetAcceptanceMode(assetRoute)
    const estimatedReviewMinutes = mode === 'A' ? 1 : mode === 'B' ? 4 : 8
    const keywordText = `${assetRoute.title} ${assetRoute.summary} ${assetRoute.landingIntro}`.toLowerCase()

    const checks = [
      {
        key: 'job_clarity',
        label: 'Job clarity',
        score:
          (/(checklist|worksheet|prompt|compare|workflow|shortlist)/.test(keywordText) ? 6 : 0) +
          (assetRoute.deliverables.length >= 3 ? 4 : 1),
        threshold: 7,
        critical: true,
        failMessage: 'The asset still reads like a topic summary instead of a specific job-to-be-done.',
        rewriteInstruction: 'Rewrite the asset promise and opening sections around one explicit action, owner, and outcome.',
      },
      {
        key: 'role_clarity',
        label: 'Role clarity',
        score:
          assetRoute.useCaseLabels.length > 0 && assetRoute.audience
            ? 10
            : assetRoute.useCaseLabels.length > 0
              ? 8
              : 3,
        threshold: 7,
        critical: false,
        failMessage: 'The visitor and operator role are still too fuzzy.',
        rewriteInstruction: 'Add explicit role and use-case framing before the first action section.',
      },
      {
        key: 'io_clarity',
        label: 'Input/output clarity',
        score: hasHeading('Input definition') && hasHeading('Output expected') ? 10 : 0,
        threshold: 7,
        critical: false,
        failMessage: 'The asset does not clearly state what goes in and what comes out.',
        rewriteInstruction: 'Add direct input and output sections with production-shaped definitions.',
      },
      {
        key: 'first_run_usability',
        label: 'First-run usability',
        score:
          hasHeading('First 30 minutes') && assetRoute.firstActionCards.length >= 3
            ? 10
            : assetRoute.firstActionCards.length >= 2
              ? 6
              : 2,
        threshold: 7,
        critical: true,
        failMessage: 'A first-time user would still hesitate before starting.',
        rewriteInstruction: 'Tighten the first 30 minutes into 3-4 irreversible next actions.',
      },
      {
        key: 'example_density',
        label: 'Example density',
        score: hasHeading('Filled example') ? 10 : assetRoute.previewItems.length >= 3 ? 6 : 2,
        threshold: 7,
        critical: false,
        failMessage: 'The asset lacks a filled example that proves how it should be used.',
        rewriteInstruction: 'Add one worked example with concrete choices, outcomes, and what changed in review.',
      },
      {
        key: 'failure_visibility',
        label: 'Failure visibility',
        score:
          hasHeading('Failure points / watch-outs') && /failure point|watch-out|Failure sign/i.test(markdown)
            ? 10
            : /failure point|watch-out/i.test(markdown)
              ? 6
              : 1,
        threshold: 7,
        critical: false,
        failMessage: 'The failure modes are still too hidden.',
        rewriteInstruction: 'Expose the failure signs, watch-outs, and reject conditions in a dedicated section.',
      },
      {
        key: 'promise_match',
        label: 'Promise / delivery match',
        score:
          assetRoute.deliverables.length >= 3 && assetRoute.previewItems.length >= 2 && assetRoute.requestBullets.length >= 2
            ? 10
            : 5,
        threshold: 7,
        critical: true,
        failMessage: 'The landing promise is stronger than the actual download body.',
        rewriteInstruction: 'Reduce hype or deepen the body so the promise and deliverables match cleanly.',
      },
      {
        key: 'next_step_continuity',
        label: 'Next-step continuity',
        score:
          hasHeading('Second run and handoff') && assetRoute.followUpPageSlugs.length > 0
            ? 10
            : assetRoute.followUpPageSlugs.length > 0
              ? 6
              : 2,
        threshold: 7,
        critical: false,
        failMessage: 'The asset does not clearly hand the visitor into the next workflow step.',
        rewriteInstruction: 'Add second-run and companion-page guidance so the asset leads somewhere concrete.',
      },
    ]

    const failedChecks = checks
      .filter((check) => check.score < check.threshold)
      .map((check) => ({
        key: check.key,
        label: check.label,
        score: check.score,
        message: check.failMessage,
        critical: check.critical,
      }))
    const criticalFailure = failedChecks.some((check) => check.critical)
    const totalScore = Math.round(
      (checks.reduce((sum, check) => sum + Math.min(check.score, 10), 0) / (checks.length * 10)) * 100,
    )
    const gateStatus = totalScore >= 70 && !criticalFailure ? 'pass' : 'rewrite_required'
    const acceptanceStatus =
      gateStatus !== 'pass'
        ? 'rewrite_required'
        : mode === 'A'
          ? 'auto_release_candidate'
          : mode === 'B'
            ? 'human_quick_review'
            : 'human_strong_review'

    return {
      acceptanceMode: mode,
      gateStatus,
      acceptanceStatus,
      totalScore,
      estimatedReviewMinutes,
      reviewRequired: gateStatus !== 'pass' || mode !== 'A',
      reviewerPrompt:
        'Check whether this solves a specific action, starts in 10 minutes, shows one concrete example, exposes a failure point, and matches the CTA promise.',
      checks: checks.map((check) => ({
        key: check.key,
        label: check.label,
        score: Math.min(check.score, 10),
        passed: check.score >= check.threshold,
        critical: check.critical,
      })),
      failedChecks,
      rewriteInstructions: checks
        .filter((check) => check.score < check.threshold)
        .map((check) => check.rewriteInstruction),
      acceptedBy: gateStatus === 'pass' && mode === 'A' ? 'auto-gate' : '',
      acceptedAt: gateStatus === 'pass' && mode === 'A' ? config.generatedAt : '',
      writebackRequired: gateStatus === 'pass',
      strongestUseCase:
        assetRoute.useCaseLabels[0] ??
        (assetRoute.primaryPages[0] ? `${assetRoute.primaryPages[0]} page visitors` : cluster.primaryKeyword),
      bestPageTypes: assetRoute.primaryPages.length > 0 ? assetRoute.primaryPages : ['index'],
      conversionQualityNote:
        gateStatus === 'pass'
          ? mode === 'A'
            ? 'This asset can be auto-released as a low-risk working download.'
            : 'This asset is structurally strong, but a human should confirm the promise before release.'
          : 'This asset still needs targeted rewrite work before it should be offered to visitors.',
      refreshPriority:
        gateStatus !== 'pass' ? 'high' : mode === 'B' || mode === 'C' ? 'medium' : 'low',
      acceptedVersion: gateStatus === 'pass' ? 'v1-accepted' : '',
      lastHumanReviewNote:
        mode === 'A'
          ? 'Auto-gate candidate; sample human spot-check only.'
          : mode === 'B'
            ? 'Quick human review recommended before release.'
            : 'Strong human review required before release.',
    }
  }

  function buildAssetDeliveryRecords() {
    return [assetSystem.primaryAsset, ...assetSystem.secondaryAssets].map((asset) => {
      const fileStem = `asset-${asset.slug}`
      const baseRecord = {
        slug: asset.slug,
        title: asset.title,
        summary: asset.summary,
        type: asset.type,
        assetKind:
          asset.type === 'template'
            ? 'template_pack'
            : asset.type === 'playbook'
              ? 'template_pack'
              : asset.type,
        audience: cluster.audience,
        primaryPages: [],
        conversionEvent: asset.event,
        clickEvent: 'asset_cta_click',
        formEvent: 'asset_form_submit',
        unlockEvent: asset.event,
        deliveryEvent: 'asset_delivery',
        landingFileName: `${fileStem}.html`,
        thankYouFileName: `${fileStem}-thank-you.html`,
        downloadFileName: `${asset.slug}.md`,
        landingPath: `/generated-sites/${cluster.siteSlug}/${fileStem}.html`,
        thankYouPath: `/generated-sites/${cluster.siteSlug}/${fileStem}-thank-you.html`,
        downloadPath: `/generated-sites/${cluster.siteSlug}/downloads/${asset.slug}.md`,
        previewItems: buildAssetPreviewItems(asset),
        deliverables: buildAssetDeliverables(asset),
        deliverySteps: buildAssetDeliverySteps(asset),
        useCaseLabels: buildAssetUseCaseLabels(asset),
        landingIntro: buildAssetLandingIntro(asset),
        evidenceCards: buildAssetEvidenceCards(asset),
        scenarioCards: buildAssetScenarioCards(asset),
        firstActionCards: buildAssetFirstActionCards(asset),
        requestBullets: buildAssetRequestBullets(asset),
        followUpPageSlugs: buildAssetFollowUpPageSlugs(asset),
        acceptanceChecks: [
          'Landing page exists',
          'Thank-you page exists',
          'Download file exists',
          'CTA, submit, and delivery events are wired',
        ],
      }

      const recordForMarkdown = {
        ...baseRecord,
        downloadMarkdown: '',
      }
      recordForMarkdown.downloadMarkdown = buildAssetMarkdown(recordForMarkdown)
      const acceptance = evaluateAssetAcceptance(recordForMarkdown)

      return {
        ...recordForMarkdown,
        acceptance,
        strongestUseCase: acceptance.strongestUseCase,
        bestPageTypes: acceptance.bestPageTypes,
        conversionQualityNote: acceptance.conversionQualityNote,
        refreshPriority: acceptance.refreshPriority,
      }
    })
  }

  const assetDeliveryRecords = buildAssetDeliveryRecords()
  const assetRouteMap = new Map(assetDeliveryRecords.map((asset) => [asset.slug, asset]))

  function buildSignalFacts(limit = 3) {
    const facts = [
      {
        label: 'SERP coverage',
        value: `${sourcePack.sourceCounts.serp} visible results and ${sourcePack.liveSignals.serpCommercialResults} commercial-style results shaped this cluster.`,
        sourceIds: idsFromRefs(sourceReferences, 2),
      },
      {
        label: 'Community signal',
        value: `${sourcePack.liveSignals.hackerNewsThreads} recent HN threads and ${sourcePack.sourceCounts.community} community refs point to operator demand.`,
        sourceIds: idsFromRefs(sourcePack.categories.community, 2),
      },
      {
        label: 'Workflow depth',
        value: `${sourcePack.sourceCounts.workflow} workflow refs, ${sourcePack.sourceCounts.deepResearch ?? 0} mapped deep-research pages, and ${useCases.length} concrete use cases were folded into the templates.`,
        sourceIds: idsFromRefs(sourcePack.categories.workflow, 2),
      },
    ]

    return facts.slice(0, limit)
  }

  function selectRefs(items, limit = 4) {
    return items
      .filter(Boolean)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        label: item.title,
        url: item.url,
        domain: item.domain,
        reason: item.snippet,
      }))
  }

  function buildFaqAnswer(question) {
    const intent = classifyIntent(question)
    if (intent === 'pricing') {
      return `Treat pricing as an operating-fit question, not just a number. Compare cost, review overhead, and how quickly a team can reuse the output.`
    }
    if (intent === 'comparison') {
      return `Shortlist a few options, compare them on time-to-value and workflow friction, and then recommend one primary choice plus one fallback instead of listing every tool equally.`
    }
    if (intent === 'workflow') {
      return `Start with one narrow pilot, capture the baseline effort, and turn the winning path into a reusable checklist or template so the next run is faster.`
    }
    if (intent === 'prompt') {
      return `Tie prompts to a concrete input, output, and success metric. A prompt is only useful when it maps to a repeatable job-to-be-done.`
    }
    return `Explain the category fast, name who it is for, and point the visitor to the next best decision surface: shortlist, workflow, or template.`
  }

  function buildAssetBinding(pageType) {
    const normalizedPageType = normalizePageTemplateType(pageType)
    const primary = assetSystem.primaryAsset
    const secondary = assetSystem.secondaryAssets[0]
    if (normalizedPageType === 'alternatives') {
      return {
        primary: secondary,
        secondary: assetSystem.secondaryAssets[1] ?? primary,
        title: `Need a faster shortlist?`,
        copy: `Convert comparison-stage visitors with ${secondary.title.toLowerCase()} so they can score options instead of reopening search.`,
      }
    }
    if (normalizedPageType === 'workflow') {
      return {
        primary: assetSystem.secondaryAssets[1] ?? primary,
        secondary: primary,
        title: `Ship the workflow with a reusable asset`,
        copy: `Use ${assetSystem.secondaryAssets[1]?.title.toLowerCase() ?? primary.title.toLowerCase()} to remove implementation friction after the first pilot.`,
      }
    }
    if (normalizedPageType === 'faq') {
      return {
        primary,
        secondary,
        title: `Turn FAQ traffic into a real next step`,
        copy: `Offer ${primary.title.toLowerCase()} as the lowest-friction move after the visitor gets the answer they needed.`,
      }
    }
    return {
      primary,
      secondary,
      title: primary.title,
      copy: `Use ${primary.title.toLowerCase()} as the main asset that carries visitors from reading into action.`,
    }
  }

  function buildCommercialModules(pageType) {
    const normalizedPageType = normalizePageTemplateType(pageType)
    const shortlistLinks = shortlistRows.slice(0, 3).map((row) => ({
      label: row.name,
      url: sourceRefMap.get(row.sourceIds[0])?.url ?? '#',
      note: row.verdict,
      event: 'affiliate_click',
      actionTier: 'high_intent_clickout',
    }))
    const assetLinks = assetDeliveryRecords.slice(0, 3).map((asset) => ({
      label: asset.title,
      url: asset.landingPath,
      note: asset.summary,
      event: 'asset_cta_click',
      actionTier: 'asset_download_path',
    }))
    const consultUrl =
      process.env.CONTACT_CTA_URL?.trim() ||
      `/generated-sites/${cluster.siteSlug}/audit-request.html`
    const sponsoredUrl = process.env.SPONSORED_SLOT_URL?.trim() || ''

    const modules = []
    if (['alternatives', 'best-tools', 'pricing', 'free-vs-paid'].includes(normalizedPageType)) {
      modules.push({
        type: 'tool-shortlist',
        title: 'Shortlist the next click',
        description: 'Give decision-stage visitors a compact set of outbound options instead of a dead-end comparison table.',
        items: shortlistLinks,
      })
    }
    if (['workflow', 'case-study', 'use-cases'].includes(normalizedPageType)) {
      modules.push({
        type: 'consult-cta',
        title: 'Need implementation help?',
        description: 'Use a consult CTA for visitors who want a faster rollout than a template alone can provide.',
        items: [
          {
            label: 'Book an audit or consult',
            url: consultUrl,
            note: 'Higher-friction CTA for commercial-intent visitors',
            event: 'consult_click',
            actionTier: 'consult_interest',
          },
        ],
      })
    }
    if (normalizedPageType === 'template-kit' && assetLinks.length > 0) {
      modules.push({
        type: 'asset-delivery',
        title: 'Get the working assets',
        description: 'Move from reading into the asset that matches the next workflow step instead of stopping at the overview.',
        items: assetLinks,
      })
    }
    if (sponsoredUrl) {
      modules.push({
        type: 'sponsored-slot',
        title: 'Featured partner slot',
        description: 'Optional sponsored inventory for a relevant product or service.',
        items: [
          {
            label: 'View featured partner',
            url: sponsoredUrl,
            note: 'Only render when an explicit partner URL is configured.',
            event: 'sponsored_click',
            actionTier: 'partner_clickout',
          },
        ],
      })
    }
    return modules
  }

  function buildMaterialSlots(pageType, refs) {
    const normalizedPageType = normalizePageTemplateType(pageType)
    const baseRefs = selectRefs(refs, 3)
    const slots = [
      {
        title: 'Evidence sources',
        type: 'sources',
        items: baseRefs.map((item) => ({
          label: item.domain,
          detail: item.reason || item.label,
          url: item.url,
        })),
      },
    ]

    if (normalizedPageType === 'workflow') {
      slots.push({
        title: 'Prompt examples',
        type: 'prompt',
        items: promptExamples.map((item) => ({
          label: item.title,
          detail: item.body,
        })),
      })
    }

    if (['pricing', 'free-vs-paid', 'alternatives'].includes(normalizedPageType)) {
      slots.push({
        title: 'Pricing notes',
        type: 'pricing',
        items: (pricingSignals.length > 0 ? pricingSignals : [{ label: 'Pricing clarity', value: caveats[0] }]).map((item) => ({
          label: item.label,
          detail: item.value,
        })),
      })
    }

    if (['pricing', 'free-vs-paid'].includes(normalizedPageType)) {
      slots.push({
        title: 'Upgrade signals',
        type: 'upgrade-signals',
        items: dedupeBy(
          [
            workflowVolumeSignal
              ? {
                  label: 'Weekly throughput signal',
                  detail: workflowVolumeSignal.detail,
                }
              : null,
            ...useCaseModels.slice(0, 2).map((model) => ({
              label: model.label,
              detail: `${model.trigger} ${model.outcome}`,
            })),
          ].filter(Boolean),
          'label',
        ).slice(0, 3),
      })
    }

    if (normalizedPageType === 'case-study') {
      slots.push({
        title: 'Before / after framing',
        type: 'before-after',
        items: [
          {
            label: 'Before',
            detail: `Teams researching ${cluster.primaryKeyword} without a clear shortlist or rollout path often bounce between vendor pages and forum threads.`,
          },
          {
            label: 'After',
            detail: `A strong page cluster gives them one shortlist, one workflow, and one reusable asset so the next move is obvious.`,
          },
        ],
      })
    }

    return slots
  }

  function buildClaim({
    claimKind,
    decisionStage,
    pageTypes,
    statement,
    whyItMatters,
    sourceIds,
    counterpoint,
    evidence,
  }) {
    const seed = `${cluster.siteSlug}:${claimKind}:${statement}:${sourceIds.join('|')}`
    const confidence = round(clamp(0.58 + Math.min(sourceIds.length, 3) * 0.12, 0.55, 0.94), 2)
    const reusePriority =
      pageTypes.length >= 4 || ['comparison', 'pricing', 'workflow', 'conversion'].includes(claimKind)
        ? 'high'
        : pageTypes.length >= 2
          ? 'medium'
          : 'low'
    const lifecycleDecision =
      sourceIds.length === 0
        ? 'refresh'
        : topCommunity.length > 0 || decisionStage === 'buy' || confidence >= 0.72
          ? 'active'
          : 'watch'
    return {
      id: toWikiId('claim', cluster.siteSlug, claimKind, shortHash(seed, 8)),
      type: 'claim',
      thesisId: toWikiId('thesis', cluster.thesisKey),
      clusterId: toWikiId('cluster', cluster.siteSlug),
      pageTypes: dedupe(pageTypes),
      claimKind,
      decisionStage,
      confidence,
      freshness: topCommunity.length > 0 ? 'current-run' : 'derived',
      sourceIds: dedupe(sourceIds),
      status: 'active',
      statement,
      whyItMatters,
      evidence: normalizeCollection(evidence).slice(0, 3),
      counterpoint,
      bestPageTypes: dedupe(pageTypes),
      reusePriority,
      performanceNote: `Used in ${dedupe(pageTypes).length} page type(s), backed by ${dedupe(sourceIds).length} source anchor(s), confidence ${confidence}.`,
      lifecycleDecision,
      refreshCondition: 'Refresh when pricing, rankings, or community complaints change materially.',
    }
  }

  const generatedClaimLibrary = dedupeBy(
    [
      buildClaim({
        claimKind: 'definition',
        decisionStage: 'discover',
        pageTypes: ['hub', 'faq', 'use-cases'],
        statement: `${cluster.primaryKeyword} works best as a decision surface that combines tools, workflow guidance, and a reusable asset.`,
        whyItMatters: 'Visitors searching this topic usually need a path to choose and act, not another category definition.',
        sourceIds: idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.serp], 2),
        counterpoint: 'If the visitor only wants a basic glossary answer, a full decision page can feel too heavy.',
        evidence: [
          `${sourcePack.sourceCounts.serp} SERP results and ${sourcePack.sourceCounts.workflow} workflow refs shaped this cluster.`,
          `Top intents observed: ${research.topIntents.join(', ') || 'overview'}.`,
        ],
      }),
      buildClaim({
        claimKind: 'workflow',
        decisionStage: 'implement',
        pageTypes: ['hub', 'workflow', 'template-kit', 'case-study'],
        statement: `Start with one narrow pilot around ${useCases[0] ?? cluster.primaryKeyword}, then package the winning path into a reusable asset.`,
        whyItMatters: 'The first production-shaped test reveals where the real review loop and workflow friction live.',
        sourceIds: idsFromRefs([...sourcePack.categories.workflow, ...sourcePack.categories.community], 2),
        counterpoint: 'Broad pilots make it harder to isolate which step actually caused failure or rework.',
        evidence: workflowSteps.slice(0, 3).map((item) => item.detail),
      }),
      buildClaim({
        claimKind: 'pricing',
        decisionStage: 'compare',
        pageTypes: ['pricing', 'free-vs-paid', 'alternatives', 'best-tools'],
        statement: 'Buyers should compare workflow cost and review overhead before they compare plan names.',
        whyItMatters: 'Visible pricing hides the operational cost of setup drag, rework, and unclear output quality.',
        sourceIds: idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.competitive], 2),
        counterpoint: 'If exact public pricing is missing, the page should say so and focus on upgrade triggers instead.',
        evidence: pricingSignals.length > 0
          ? pricingSignals.map((item) => `${item.label}: ${item.value}`)
          : [caveats[0]],
      }),
      buildClaim({
        claimKind: 'comparison',
        decisionStage: 'compare',
        pageTypes: ['hub', 'alternatives', 'best-tools', 'pricing'],
        statement: `${shortlistRows[0]?.name ?? cluster.primaryKeyword} is the recommended first shortlist review because it fits the highest-intent visitor best.`,
        whyItMatters: 'Comparison pages convert better when they collapse the field to one primary option and one fallback.',
        sourceIds: shortlistRows[0]?.sourceIds ?? sharedSourceIds,
        counterpoint: shortlistRows[0]?.notFor ?? caveats[0],
        evidence: shortlistRows.slice(0, 2).map((row) => `${row.name}: ${row.verdict}. ${row.bestFor}`),
      }),
      buildClaim({
        claimKind: 'recommendation',
        decisionStage: 'buy',
        pageTypes: ['alternatives', 'best-tools', 'template-kit'],
        statement: `The right next step is to grab ${assetSystem.primaryAsset.title.toLowerCase()} before opening more tabs.`,
        whyItMatters: 'A concrete asset turns category research into a measurable next action.',
        sourceIds: idsFromRefs(sourcePack.categories.workflow, 1),
        counterpoint: 'If the asset does not help the first pilot happen faster, it is not strong enough yet.',
        evidence: [
          assetSystem.primaryAsset.summary,
          `${assetSystem.secondaryAssets[0]?.title ?? 'Checklist'} supports the repeat run.`,
        ],
      }),
      buildClaim({
        claimKind: 'failure_mode',
        decisionStage: 'implement',
        pageTypes: ['workflow', 'pricing', 'free-vs-paid', 'case-study'],
        statement: caveats[0],
        whyItMatters: 'Naming the first likely failure mode is what makes the page useful once visitors try the workflow for real.',
        sourceIds: idsFromRefs(sourcePack.categories.community, 2),
        counterpoint: 'Failure modes shift by audience and use case, so they should be refreshed as new complaints appear.',
        evidence: topCommunity.map((item) => item.snippet || item.title),
      }),
      buildClaim({
        claimKind: 'caveat',
        decisionStage: 'compare',
        pageTypes: ['hub', 'alternatives', 'pricing', 'free-vs-paid'],
        statement: 'Public pricing clarity is still uneven, so strong pages should explain tradeoffs before asking for the click.',
        whyItMatters: 'This keeps the content honest when the evidence is incomplete.',
        sourceIds: idsFromRefs([...sourcePack.categories.competitive, ...sourcePack.categories.serp], 2),
        counterpoint: 'If pricing becomes explicit later, the page should switch from caveat-heavy to benchmark-heavy.',
        evidence: [
          pricingSignals[0]?.value ?? caveats[0],
          `Detected ${research.gapSummary.outdatedResultCount} outdated SERP results.`,
        ],
      }),
      ...useCaseModels.slice(0, 3).map((useCaseModel, index) =>
        buildClaim({
          claimKind: 'use_case',
          decisionStage: 'discover',
          pageTypes: ['hub', 'workflow', 'use-cases', 'case-study'],
          statement: `${useCaseModel.label} is a concrete entry point for ${cluster.primaryKeyword}.`,
          whyItMatters: 'Specific use cases reduce generic category copy and make the first workflow test easier to define.',
          sourceIds: useCaseModel.sourceIds,
          counterpoint: 'A use case page gets weak when multiple jobs collapse into the same generic recommendation.',
          evidence: [
            `Audience: ${useCaseModel.audience}`,
            `Trigger: ${useCaseModel.trigger}`,
            `Workflow: ${useCaseModel.workflow}`,
            `CTA: ${useCaseModel.cta.title}`,
            `Suggested query ${index + 1}: ${useCaseModel.label}`,
          ],
        }),
      ),
      buildClaim({
        claimKind: 'conversion',
        decisionStage: 'buy',
        pageTypes: ['hub', 'faq', 'template-kit', 'use-cases'],
        statement: `${assetSystem.primaryAsset.title} is the main conversion asset because it shortens the time from reading to the first test.`,
        whyItMatters: 'The page should sell the next useful action, not just publish more opinionated prose.',
        sourceIds: idsFromRefs(sourcePack.categories.workflow, 1),
        counterpoint: 'If visitors want hands-on help, a consult CTA can outperform a low-friction download.',
        evidence: [
          assetSystem.primaryAsset.summary,
          ...assetSystem.secondaryAssets.map((asset) => asset.summary),
        ],
      }),
    ],
    'id',
  )
  const wikiClaims = safeArray(wikiSeed?.claims)
  const claimById = new Map()
  for (const generatedClaim of generatedClaimLibrary) {
    claimById.set(generatedClaim.id, mergeClaimCard(generatedClaim, null))
  }
  for (const wikiClaim of wikiClaims) {
    if (!wikiClaim?.id) continue
    claimById.set(wikiClaim.id, mergeClaimCard(claimById.get(wikiClaim.id) ?? null, wikiClaim))
  }
  function ensureClaimNarrative(claim) {
    const sourceCount = safeArray(claim?.sourceIds).length
    const pageTypeCount = safeArray(claim?.pageTypes).length
    const fallbackStatementByKind = {
      definition: `${cluster.primaryKeyword} should help the visitor move from category curiosity to a concrete shortlist, workflow, or asset decision.`,
      workflow: `The fastest path into ${cluster.primaryKeyword} is one narrow pilot that can be reviewed, repeated, and packaged into an asset.`,
      pricing: `Buyers should compare workflow cost, review overhead, and reuse potential before they compare plan names for ${cluster.primaryKeyword}.`,
      comparison: `${cluster.primaryKeyword} pages work best when they collapse the field into one primary recommendation and one fallback instead of treating every option as equal.`,
      recommendation: `${assetSystem.primaryAsset.title} should be the first concrete next step after the visitor understands the tradeoff.`,
      failure_mode: `The first avoidable failure in ${cluster.primaryKeyword} is usually unclear review, weak handoff, or too much workflow spread across tools.`,
      caveat: `Public evidence around ${cluster.primaryKeyword} is still uneven, so pages should name missing pricing, workflow gaps, or freshness limits honestly.`,
      use_case: `${cluster.primaryKeyword} becomes easier to evaluate once the page narrows the category to a real operator job.`,
      conversion: `${assetSystem.primaryAsset.title} earns the click only if it makes the first real test easier to run than staying in search results.`,
    }
    const fallbackStatement =
      fallbackStatementByKind[claim?.claimKind] ??
      `${titleCase(claim?.claimKind || 'claim')} guidance for ${cluster.primaryKeyword}.`

    return {
      ...claim,
      statement: preferMeaningfulText(claim?.statement, fallbackStatement),
      whyItMatters: preferMeaningfulText(
        claim?.whyItMatters,
        `This claim supports the ${claim?.decisionStage || 'discover'} stage and helps ${cluster.audience} choose a clearer next move.`,
      ),
      evidence:
        meaningfulList(claim?.evidence).length > 0
          ? meaningfulList(claim.evidence).slice(0, 3)
          : [
              `${pageTypeCount} page type(s) currently reuse this claim.`,
              `${sourceCount} source anchor(s) back the current version.`,
            ],
      counterpoint: preferMeaningfulText(
        claim?.counterpoint,
        'Refresh this claim when newer pricing, workflow, or community evidence materially changes the tradeoff.',
      ),
      refreshCondition: preferMeaningfulText(
        claim?.refreshCondition,
        'Refresh when pricing, rankings, or operator complaints shift materially.',
      ),
    }
  }
  const claimLibrary = [...claimById.values()].filter(Boolean).map((claim) => ensureClaimNarrative(claim))
  const claimMap = new Map(claimLibrary.map((claim) => [claim.id, claim]))

  function scoreClaimForPageUse(claim, pageType, preferredKind = '') {
    const pageTypeMatch = safeArray(claim?.pageTypes).includes(pageType) ? 24 : 0
    const kindMatch = preferredKind && claim?.claimKind === preferredKind ? 20 : 0
    const bestPageMatch = safeArray(claim?.bestPageTypes).includes(pageType) ? 10 : 0
    const evidenceScore = Math.min(meaningfulList(claim?.evidence).length * 3, 9)
    const sourceScore = Math.min(safeArray(claim?.sourceIds).length * 2, 6)
    const lifecycleBonus =
      meaningfulText(claim?.lifecycleDecision).toLowerCase() === 'active'
        ? 6
        : meaningfulText(claim?.lifecycleDecision).toLowerCase() === 'watch'
          ? 2
          : 0

    return (
      preferFiniteNumber(claim?.qualityScore, computeClaimQualityScore(claim)) +
      pageTypeMatch +
      kindMatch +
      bestPageMatch +
      evidenceScore +
      sourceScore +
      lifecycleBonus
    )
  }

  function selectClaimCards(pageType, kinds, limit = 4) {
    const ordered = []
    for (const kind of kinds) {
      ordered.push(
        ...claimLibrary.filter(
          (claim) => claim.claimKind === kind && claim.pageTypes.includes(pageType),
        ),
      )
      ordered.push(...claimLibrary.filter((claim) => claim.claimKind === kind))
    }
    ordered.push(...claimLibrary.filter((claim) => claim.pageTypes.includes(pageType)))
    return dedupeBy(ordered, 'id')
      .filter(
        (claim) =>
          meaningfulText(claim?.statement) ||
          meaningfulText(claim?.whyItMatters) ||
          meaningfulList(claim?.evidence).length > 0,
      )
      .toSorted((left, right) => {
        const leftKind = kinds.find((kind) => left.claimKind === kind) ?? ''
        const rightKind = kinds.find((kind) => right.claimKind === kind) ?? ''
        const leftScore = scoreClaimForPageUse(left, pageType, leftKind)
        const rightScore = scoreClaimForPageUse(right, pageType, rightKind)
        if (rightScore !== leftScore) return rightScore - leftScore
        return right.confidence - left.confidence
      })
      .slice(0, limit)
  }

  const sourceIdResolver = mapAgentSourceIds(sourceReferences)
  const firecrawlChangelogSignals = collectFirecrawlSignalEntries('changelog', 4).map((item) => ({
    title: item.title,
    detail: item.detail,
    sourceIds: item.sourceIds,
  }))
  const firecrawlCommunitySignals = collectFirecrawlSignalEntries('caveats', 4).map((item) => ({
    title: item.title,
    detail: item.detail,
    sourceIds: item.sourceIds,
  }))
  const heuristicResearchDossier = {
    id: toWikiId('research-dossier', cluster.siteSlug),
    thesisId: toWikiId('thesis', cluster.thesisKey),
    clusterId: toWikiId('cluster', cluster.siteSlug),
    generatedAt: config.generatedAt,
    pricingSummary: pricingSignals.map((item) => ({
      label: item.label,
      detail: item.value,
      sourceIds: item.sourceIds,
    })),
    changelogSignals: dedupeBy(
      [
        ...[...sourcePack.categories.official, ...sourcePack.categories.workflow, ...deepResearchPages]
        .filter(
          (item) =>
            item.detectedYear != null ||
            /\b(update|updated|release|version|changelog|new)\b/i.test(
              `${item.title} ${item.snippet}`,
            ),
        )
        .map((item) => ({
          title: item.title,
          detail: compactText(item.snippet || item.title, 180),
          sourceIds: [item.id],
        })),
        ...firecrawlChangelogSignals,
      ],
      'title',
    ).slice(0, 4),
    communityPainSignals: dedupeBy(
      [
        ...topCommunity.map((item) => ({
          title: item.title,
          detail: compactText(item.snippet || item.title, 180),
          sourceIds: [item.id],
        })),
        ...firecrawlCommunitySignals,
      ],
      'detail',
    ).slice(0, 4),
    useCases,
    useCaseModels,
    failureModes: caveats,
    competitorPositioning: shortlistRows.map((row) => ({
      name: row.name,
      bestFor: row.bestFor,
      watchout: row.notFor,
      sourceIds: row.sourceIds,
    })),
    sourceIds: dedupe(sourceReferences.map((item) => item.id)).slice(0, 12),
    claimIds: claimLibrary.map((claim) => claim.id),
  }
  const researchDossier = sourcePack.firecrawlAgentDossier
    ? {
        ...heuristicResearchDossier,
        pricingSummary: mergeResearchDossierSignals(
          heuristicResearchDossier.pricingSummary,
          safeArray(sourcePack.firecrawlAgentDossier.pricingSummary),
          sourceIdResolver,
        ).slice(0, 6),
        changelogSignals: mergeResearchDossierSignals(
          heuristicResearchDossier.changelogSignals,
          safeArray(sourcePack.firecrawlAgentDossier.changelogSignals),
          sourceIdResolver,
          'title',
        ).slice(0, 6),
        communityPainSignals: mergeResearchDossierSignals(
          heuristicResearchDossier.communityPainSignals,
          safeArray(sourcePack.firecrawlAgentDossier.communityPainSignals),
          sourceIdResolver,
          'detail',
        ).slice(0, 6),
        useCases: dedupe([
          ...heuristicResearchDossier.useCases,
          ...safeArray(sourcePack.firecrawlAgentDossier.useCases),
        ]).slice(0, 8),
        useCaseModels: heuristicResearchDossier.useCaseModels,
        failureModes: dedupe([
          ...heuristicResearchDossier.failureModes,
          ...safeArray(sourcePack.firecrawlAgentDossier.failureModes),
        ]).slice(0, 8),
        competitorPositioning: dedupeBy(
          [
            ...heuristicResearchDossier.competitorPositioning,
            ...safeArray(sourcePack.firecrawlAgentDossier.competitorPositioning).map((item) => ({
              name: item.name,
              bestFor: item.bestFor,
              watchout: item.watchout,
              sourceIds: sourceIdResolver(item.sourceUrl ?? item.url),
            })),
          ].filter((item) => item?.name),
          'name',
        ).slice(0, 6),
        assetIdeas: safeArray(sourcePack.firecrawlAgentDossier.assetIdeas).slice(0, 6),
        extractionSources: {
          heuristic: true,
          firecrawlAgent: true,
          deepResearchPages: deepResearchPages.length,
        },
      }
    : {
        ...heuristicResearchDossier,
        assetIdeas: [],
        extractionSources: {
          heuristic: true,
          firecrawlAgent: false,
          deepResearchPages: deepResearchPages.length,
        },
      }

  const pageBriefProfiles = {
    hub: {
      targetIntent: 'overview_to_decision',
      primaryKinds: ['definition', 'comparison', 'workflow', 'conversion'],
      secondaryKinds: ['use_case', 'caveat'],
      pageGoal: `Help a visitor decide whether ${cluster.primaryKeyword} is worth deeper evaluation and what to do next.`,
      visitorIntent: 'Map the category fast, then choose the best next surface: shortlist, workflow, or asset.',
      mustWinQuestions: [
        `What does ${cluster.primaryKeyword} actually solve?`,
        'Which path should the visitor evaluate first?',
        'What asset should they take before they leave?',
      ],
      requiredSections: ['Verdicts', 'Shortlist logic', 'Workflow route', 'Asset CTA'],
      requiredExamples: useCases.slice(0, 2),
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['Feels like a glossary page', 'Does not recommend a first move'],
      ctaStrategy: 'lead_with_asset',
      reviewPriority: 'high',
      internalLinkRole: 'site-hub',
    },
    alternatives: {
      targetIntent: 'decision_stage_comparison',
      primaryKinds: ['comparison', 'pricing', 'recommendation'],
      secondaryKinds: ['caveat', 'failure_mode'],
      pageGoal: 'Collapse a noisy tool field into one recommended first click and one fallback.',
      visitorIntent: 'Compare options without reopening search results five more times.',
      mustWinQuestions: ['Which option should I shortlist first?', 'What is the fallback?', 'Why are the others not first?'],
      requiredSections: ['Verdict table', 'Ranking criteria', 'Outbound click block', 'CTA asset'],
      requiredExamples: shortlistRows.slice(0, 2).map((row) => row.name),
      requiredCaveats: caveats.slice(0, 2),
      failureConditions: ['Ranks options without evidence', 'Every option sounds equally good'],
      ctaStrategy: 'comparison_to_asset',
      reviewPriority: 'high',
      internalLinkRole: 'decision-spoke',
    },
    workflow: {
      targetIntent: 'implementation',
      primaryKinds: ['workflow', 'failure_mode', 'use_case'],
      secondaryKinds: ['conversion', 'caveat'],
      pageGoal: 'Turn interest into a first pilot with clear inputs, outputs, and failure points.',
      visitorIntent: 'Run one production-shaped test and avoid the first avoidable mistake.',
      mustWinQuestions: ['What do I input?', 'What do I output?', 'What usually breaks first?'],
      requiredSections: ['Step cards', 'Prompt examples', 'Failure points', 'Reusable asset CTA'],
      requiredExamples: promptExamples.map((item) => item.title),
      requiredCaveats: caveats.slice(0, 2),
      failureConditions: ['Hides the review loop', 'Does not name a measurable pilot'],
      ctaStrategy: 'implementation_asset',
      reviewPriority: 'high',
      internalLinkRole: 'execution-spoke',
    },
    faq: {
      targetIntent: 'answer_to_next_step',
      primaryKinds: ['definition', 'conversion', 'pricing'],
      secondaryKinds: ['workflow', 'comparison'],
      pageGoal: 'Answer narrow search questions while pointing to one clear next action.',
      visitorIntent: 'Get a quick answer without losing the next step.',
      mustWinQuestions: ['What is the direct answer?', 'What should I click next if this matters?'],
      requiredSections: ['FAQ', 'One next step', 'Asset CTA'],
      requiredExamples: useCases.slice(0, 1),
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['Answers stay abstract', 'No route to a higher-intent page'],
      ctaStrategy: 'low_friction_asset',
      reviewPriority: 'medium',
      internalLinkRole: 'faq-spoke',
    },
    'best-tools': {
      targetIntent: 'category_shortlist',
      primaryKinds: ['comparison', 'recommendation', 'pricing'],
      secondaryKinds: ['caveat'],
      pageGoal: 'Group the market by buyer fit so visitors can self-select faster.',
      visitorIntent: 'See a ranked field with clearer fit signals than a generic listicle.',
      mustWinQuestions: ['Who should click first?', 'Why is that option first?', 'Who should avoid it?'],
      requiredSections: ['Ranked shortlist', 'Fit framing', 'CTA asset'],
      requiredExamples: shortlistRows.slice(0, 3).map((row) => row.name),
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['Reads like a feature dump', 'Does not split by buyer fit'],
      ctaStrategy: 'comparison_to_asset',
      reviewPriority: 'high',
      internalLinkRole: 'decision-spoke',
    },
    pricing: {
      targetIntent: 'commercial_evaluation',
      primaryKinds: ['pricing', 'caveat', 'recommendation'],
      secondaryKinds: ['comparison', 'failure_mode'],
      pageGoal: 'Explain visible and hidden cost so the buyer can compare fit honestly.',
      visitorIntent: 'Estimate real operating cost before clicking out or upgrading.',
      mustWinQuestions: ['What does this actually cost?', 'Where does hidden cost show up?', 'When should I upgrade?'],
      requiredSections: ['Pricing facts', 'Hidden cost', 'Upgrade trigger', 'CTA asset'],
      requiredExamples: pricingSignals.slice(0, 2).map((item) => item.label),
      requiredCaveats: caveats.slice(0, 2),
      failureConditions: ['Only repeats plan names', 'Pretends missing pricing is complete'],
      ctaStrategy: 'comparison_to_asset',
      reviewPriority: 'high',
      internalLinkRole: 'commercial-spoke',
    },
    'free-vs-paid': {
      targetIntent: 'upgrade_decision',
      primaryKinds: ['pricing', 'failure_mode', 'workflow'],
      secondaryKinds: ['caveat', 'use_case'],
      pageGoal: 'Show when free is enough and when a paid path becomes rational.',
      visitorIntent: 'Know the upgrade trigger before wasting cycles on the wrong tier.',
      mustWinQuestions: ['When is free enough?', 'What breaks first?', 'What is the paid unlock?'],
      requiredSections: ['Free path', 'Paid path', 'Upgrade trigger', 'CTA asset'],
      requiredExamples: ['Free path', 'Paid path'],
      requiredCaveats: caveats.slice(0, 2),
      failureConditions: ['Speaks in slogans', 'Does not name the trigger'],
      ctaStrategy: 'comparison_to_asset',
      reviewPriority: 'high',
      internalLinkRole: 'commercial-spoke',
    },
    'use-cases': {
      targetIntent: 'job_to_be_done',
      primaryKinds: ['use_case', 'workflow', 'conversion'],
      secondaryKinds: ['comparison', 'caveat'],
      pageGoal: 'Tie the category to narrow jobs-to-be-done with a believable first workflow.',
      visitorIntent: 'See whether this category fits my job, not a generic market segment.',
      mustWinQuestions: ['Which use case fits me?', 'What workflow starts there?', 'What asset helps me test it?'],
      requiredSections: ['Use case map', 'Example scenario', 'Workflow next step', 'CTA asset'],
      requiredExamples: useCases,
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['Repeats the same use case with different nouns', 'No scenario feels real'],
      ctaStrategy: 'lead_with_asset',
      reviewPriority: 'medium',
      internalLinkRole: 'execution-spoke',
    },
    'template-kit': {
      targetIntent: 'asset_evaluation',
      primaryKinds: ['conversion', 'workflow', 'recommendation'],
      secondaryKinds: ['use_case', 'caveat'],
      pageGoal: 'Make the conversion asset feel like a real product the visitor can use immediately.',
      visitorIntent: 'Understand what is included, who it is for, and why it reduces work now.',
      mustWinQuestions: ['What do I get?', 'What workflow does it accelerate?', 'Why is it worth taking now?'],
      requiredSections: ['Asset inventory', 'First-run example', 'Repeat-run example', 'Delivery CTA'],
      requiredExamples: ['First run', 'Second run'],
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['Asset feels vague', 'No tie back to a workflow'],
      ctaStrategy: 'implementation_asset',
      reviewPriority: 'high',
      internalLinkRole: 'conversion-page',
    },
    'case-study': {
      targetIntent: 'proof_of_path',
      primaryKinds: ['workflow', 'failure_mode', 'conversion'],
      secondaryKinds: ['use_case', 'comparison'],
      pageGoal: 'Show a believable before/after that proves the workflow and asset system are reusable.',
      visitorIntent: 'See whether the path works in practice and what changed after adoption.',
      mustWinQuestions: ['What changed?', 'What got documented?', 'What does the visitor do next?'],
      requiredSections: ['Before', 'Intervention', 'Outcome', 'CTA asset or consult'],
      requiredExamples: ['Before', 'After'],
      requiredCaveats: caveats.slice(0, 1),
      failureConditions: ['No believable intervention', 'No link back to a reusable asset'],
      ctaStrategy: 'implementation_asset',
      reviewPriority: 'high',
      internalLinkRole: 'proof-page',
    },
  }
  const wikiPageBriefMap = new Map(
    safeArray(wikiSeed?.pageBriefs).map((brief) => [brief.pageType, brief]),
  )

  function buildPageBrief(pageType, assetBinding) {
    const normalizedPageType = normalizePageTemplateType(pageType)
    const profile = pageBriefProfiles[normalizedPageType] ?? pageBriefProfiles.hub
    const primaryClaims = selectClaimCards(normalizedPageType, profile.primaryKinds, 4)
    const secondaryClaims = selectClaimCards(normalizedPageType, profile.secondaryKinds, 3).filter(
      (claim) => !primaryClaims.some((primary) => primary.id === claim.id),
    )

    const generatedBrief = {
      id: toWikiId('page-brief', cluster.siteSlug, normalizedPageType),
      type: 'page_brief',
      thesisId: toWikiId('thesis', cluster.thesisKey),
      clusterId: toWikiId('cluster', cluster.siteSlug),
      pageType: normalizedPageType,
      targetIntent: profile.targetIntent,
      targetAsset: assetBinding.primary.title,
      primaryClaimIds: primaryClaims.map((claim) => claim.id),
      secondaryClaimIds: secondaryClaims.map((claim) => claim.id),
      requiredSections: profile.requiredSections,
      ctaStrategy: profile.ctaStrategy,
      reviewPriority: profile.reviewPriority,
      internalLinkRole: profile.internalLinkRole,
      pageGoal: profile.pageGoal,
      visitorIntent: profile.visitorIntent,
      mustWinQuestions: profile.mustWinQuestions,
      requiredExamples: profile.requiredExamples,
      requiredCaveats: profile.requiredCaveats,
      failureConditions: profile.failureConditions,
    }

    return mergePageBriefCard(generatedBrief, wikiPageBriefMap.get(normalizedPageType) ?? null)
  }

  const primaryAssetFlow = assetRouteMap.get(assetSystem.primaryAsset.slug)
  const pricingAnchor = pricingSignals[0] ?? null
  const workflowVolumeSignal = safeArray(researchDossier.communityPainSignals).find((item) =>
    /\b20\+|weekly|monday|batch generation|throughput\b/i.test(item.detail || item.title),
  ) ?? safeArray(researchDossier.communityPainSignals)[0] ?? null
  const automationScaleSource = sourcePack.categories.official.find((item) =>
    /\b(90%|autopilot|single workspace|160\+ languages|scale content faster)\b/i.test(
      `${item.title} ${item.snippet}`,
    ),
  ) ?? sourcePack.categories.official.find((item) =>
    /\b(scale|faster|business|studio-quality)\b/i.test(`${item.title} ${item.snippet}`),
  ) ?? null
  const businessRoiSource = sourcePack.categories.official.find((item) =>
    item.id !== automationScaleSource?.id &&
    /\b(90%|160\+ languages|time and cost|business)\b/i.test(`${item.title} ${item.snippet}`),
  ) ?? null

  const pricingAnchorSnapshot = extractPricingAnchorSnapshot(pricingAnchor)
  const automationScaleBrand = brandNameFromSource(automationScaleSource)
  const businessRoiBrand = brandNameFromSource(businessRoiSource)

  function buildCommercialUseCaseCards(limit = 3) {
    return buildUseCaseCards(
      useCaseModels
        .filter((model) => model.cta.assetSlug === assetSystem.primaryAsset.slug)
        .slice(0, limit),
    )
  }

  function buildPricingEvidenceCards() {
    const cards = []

    if (pricingAnchor) {
      cards.push({
        label: 'Visible price anchor',
        detail: pricingAnchorSnapshot.price
          ? `${pricingAnchor.label} shows a public floor price of ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for a ${pricingAnchorSnapshot.duration} horizontal-video workflow` : ''}${pricingAnchorSnapshot.oneTime ? ', billed one time' : ''}${pricingAnchorSnapshot.noSubscription ? ', with no subscription shown on the page' : ''}.`
          : `${pricingAnchor.label} is one of the few pages in the set with a public price anchor instead of vague plan labels.`,
        href: sourceRefMap.get(pricingAnchor.sourceIds?.[0])?.url ?? '',
      })
    }

    if (workflowVolumeSignal) {
      cards.push({
        label: 'Batch-production signal',
        detail:
          'The community signal is a workflow-quality question, not a coupon question: operators are comparing which workflow still holds up as AI video quality changes, which usually appears once review consistency becomes the real cost.',
        href: sourceRefMap.get(workflowVolumeSignal.sourceIds?.[0])?.url ?? '',
      })
    }

    if (automationScaleSource) {
      cards.push({
        label: 'Why teams pay',
        detail:
          `${automationScaleBrand} sells workflow controls like autopilot, scheduling, and a shared workspace. That is commercial evidence that buyers pay to remove coordination drag, not only to buy more generations.`,
        href: automationScaleSource.url,
      })
    }

    if (businessRoiSource) {
      cards.push({
        label: 'ROI-style proof',
        detail:
          `${businessRoiBrand} frames paid video around business output: studio-quality delivery, 160+ languages, and claims of up to 90% time-and-cost savings. That is the kind of ROI promise budget owners actually evaluate.`,
        href: businessRoiSource.url,
      })
    }

    return cards.slice(0, 4)
  }

  function buildAlternativesEvidenceCards() {
    return dedupeBy(
      [
        shortlistRows[0]
          ? {
              label: 'Recommended first click',
              detail: `${shortlistRows[0].name} stays first because it best fits ${shortlistRows[0].bestFor.toLowerCase()} and already carries a concrete watch-out: ${shortlistRows[0].notFor}.`,
              href: sourceRefMap.get(shortlistRows[0].sourceIds?.[0])?.url ?? '',
            }
          : null,
        pricingAnchor
          ? {
              label: 'Pricing clarity anchor',
              detail: pricingAnchorSnapshot.price
                ? `One of the clearest public anchors still starts at ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}. That matters because shortlist pages should not rank tools as equals when pricing visibility is uneven.`
                : 'Public pricing visibility is still uneven across the shortlist, so ranking logic needs to say where the page is extrapolating.',
              href: sourceRefMap.get(pricingAnchor.sourceIds?.[0])?.url ?? '',
            }
          : null,
        workflowVolumeSignal
          ? {
              label: 'Operator pain signal',
              detail: 'Community evidence is still about workflow quality, throughput, and repeatability. That is a stronger ranking input than generic feature breadth when a buyer needs one first review path.',
              href: sourceRefMap.get(workflowVolumeSignal.sourceIds?.[0])?.url ?? '',
            }
          : null,
        {
          label: 'Decision asset follow-through',
          detail: `${assetSystem.secondaryAssets[0]?.title ?? 'The checklist'} and ${assetSystem.secondaryAssets[1]?.title ?? 'the worksheet'} exist so the buyer can log the first choice, the fallback, and the reject reasons instead of reopening search.`,
          href:
            assetRouteMap.get(assetSystem.secondaryAssets[0]?.slug ?? assetSystem.primaryAsset.slug)
              ?.landingPath ?? '',
        },
      ].filter(Boolean),
      'label',
    ).slice(0, 4)
  }

  function buildWorkflowEvidenceCards() {
    return dedupeBy(
      [
        {
          label: 'Step-level operating proof',
          detail: `${workflowSteps.length} workflow checkpoints already name the input, output, owner, success metric, and failure point. That keeps this page grounded in an actual run sequence instead of generic advice.`,
          href: '',
        },
        workflowVolumeSignal
          ? {
              label: 'Where the workflow breaks first',
              detail: 'The community signal points to review consistency and workflow quality drift, which is why the page has to explain the handoff and failure point at each step.',
              href: sourceRefMap.get(workflowVolumeSignal.sourceIds?.[0])?.url ?? '',
            }
          : null,
        {
          label: 'Reusable asset handoff',
          detail: `${assetSystem.secondaryAssets[1]?.title ?? assetSystem.primaryAsset.title} and ${assetSystem.primaryAsset.title} give the visitor a first-run asset plus a repeat-run handoff so the second execution does not restart from blank prompts.`,
          href:
            assetRouteMap.get(assetSystem.secondaryAssets[1]?.slug ?? assetSystem.primaryAsset.slug)
              ?.landingPath ?? '',
        },
        pricingAnchor
          ? {
              label: 'Pilot budget discipline',
              detail: pricingAnchorSnapshot.price
                ? `A visible benchmark still starts at ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}, which is why this workflow stays scoped to one narrow pilot before it expands.`
                : 'This page assumes a narrow first pilot because public cost visibility is still uneven.',
              href: sourceRefMap.get(pricingAnchor.sourceIds?.[0])?.url ?? '',
            }
          : null,
      ].filter(Boolean),
      'label',
    ).slice(0, 4)
  }

  function buildPricingExamples() {
    const examples = []

    if (pricingAnchor) {
      examples.push({
        title: 'Pilot budget line',
        body: pricingAnchorSnapshot.price
          ? `A marketer scoping a first launch clip can model the pilot around ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for a ${pricingAnchorSnapshot.duration} output` : ''} plus manual review, instead of guessing at enterprise pricing before the workflow proves itself.`
          : `A marketer can use the visible public benchmark as a pilot budget line instead of guessing at enterprise pricing before the workflow proves itself.`,
      })
    }

    if (workflowVolumeSignal) {
      examples.push({
        title: 'Weekly release queue',
        body:
          'Once two or three product updates need review in the same month, the cost question shifts to reviewer hours, version churn, and whether the workflow can be rerun without rebuilding the brief from scratch.',
      })
    }

    if (automationScaleSource) {
      examples.push({
        title: 'Repeatable launch team',
        body:
          `${automationScaleBrand} becomes persuasive once the same launch workflow keeps repeating; autopilot, scheduling, and one workspace matter because the workflow handoff repeats every cycle.`,
      })
    }

    if (businessRoiSource) {
      examples.push({
        title: 'Finance conversation',
        body:
          `${businessRoiBrand} gives the budget owner a real workflow justification frame: 160+ languages and up to 90% time-and-cost savings are easier to defend than a page full of feature bullets.`,
      })
    }

    return examples.slice(0, 3)
  }

  function buildPricingComparisonRows() {
    return dedupeBy(
      [
        pricingAnchor
          ? {
              name: 'Visible one-time benchmark',
              bestFor: 'Single launch experiments and low-volume validation',
              notFor: 'Teams that already know the workflow will repeat every week',
              verdict: 'Useful as the floor price, not the full operating-cost model',
              pricingSignal: pricingAnchorSnapshot.price
                ? `${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}${pricingAnchorSnapshot.oneTime ? ', one-time' : ''}${pricingAnchorSnapshot.noSubscription ? ', no subscription shown' : ''}`
                : compactText(pricingAnchor.value, 160),
              sourceIds: pricingAnchor.sourceIds,
            }
          : null,
        {
          name: 'Free or stitched workflow',
          bestFor: 'Exploration before a repeatable format or owner exists',
          notFor:
            workflowVolumeSignal?.detail
              ? 'Teams where multiple reviewers now touch the same workflow every week'
              : 'Teams with weekly throughput and multiple review loops',
          verdict: 'Cheap in cash, expensive in coordination once the workflow repeats',
          pricingSignal: 'Low sticker price, but review, rework, and handoff overhead compound fast',
          sourceIds:
            workflowVolumeSignal?.sourceIds ??
            idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.competitive], 1),
        },
        automationScaleSource
          ? {
              name: 'Paid workflow suite',
              bestFor: 'Recurring launch teams, batch operators, and business video workflows',
              notFor: 'Visitors who still do not know whether the category matters for them',
              verdict: 'Pay when reuse, scheduling, and approval speed matter more than experimentation',
              pricingSignal: 'Commercial value comes from autopilot, shared workspace, scheduling, and faster approvals',
              sourceIds: [automationScaleSource.id],
            }
          : null,
        businessRoiSource
          ? {
              name: 'Business rollout suite',
              bestFor: 'Localized demos, sales enablement, and teams that need video across markets',
              notFor: 'Single launch clips with no repeat schedule',
              verdict: 'Higher spend only makes sense when the workflow has a real ROI story behind it',
              pricingSignal: 'Look for hard business language such as 160+ languages or up to 90% time-and-cost savings',
              sourceIds: [businessRoiSource.id],
            }
          : null,
      ].filter(Boolean),
      'name',
    )
  }

  function buildFreeVsPaidExamples() {
    const examples = []

    examples.push({
      title: 'Single launch validation',
      body: pricingAnchorSnapshot.price
        ? `One founder shipping one feature demo can stay near the free path and use ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` as the public benchmark for a ${pricingAnchorSnapshot.duration} output` : ' as the public benchmark'} while demand is still being validated.`
        : 'One founder shipping one feature demo can stay near the free path while demand is still being validated.',
    })

    if (workflowVolumeSignal) {
      examples.push({
        title: 'Weekly batch operator',
        body:
          'The community signal here is not about cheaper plans. It is about which workflow survives repeated use, which is exactly when the upgrade decision becomes about queue speed, reviewer time, and keeping quality stable.',
      })
    }

    if (automationScaleSource) {
      examples.push({
        title: 'Repeat launch team',
        body:
          `${automationScaleBrand} becomes relevant when the same screenshot-driven workflow gets reused across launches; a single workspace and scheduled handoff start saving real time only after the second or third repeat.`,
      })
    }

    if (businessRoiSource) {
      examples.push({
        title: 'Multilingual business rollout',
        body:
          `${businessRoiBrand} points to the higher-end paid unlock: if the workflow needs localization, sales follow-up, or stakeholder-ready output, 160+ languages and time-savings claims map better to the buyer job than free experimentation does.`,
      })
    }

    return examples.slice(0, 3)
  }

  function buildFreeVsPaidComparisonRows() {
    return dedupeBy(
      [
        {
          name: 'Validation path',
          bestFor: 'Exploration, single-user testing, and one-off launch clips',
          notFor: 'Teams that already need repeatable output and shared review',
          verdict: 'Stay free or near-free until the workflow earns another run',
          pricingSignal: pricingAnchorSnapshot.price
            ? `Use the visible floor price of ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''} as the low-end benchmark`
            : 'Keep cash cost low until the workflow proves it deserves a repeatable budget line.',
          sourceIds:
            pricingAnchor?.sourceIds ??
            idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.competitive], 1),
        },
        {
          name: 'Repeatable launch path',
          bestFor: 'Product marketers reusing the same announcement or screenshot-driven format',
          notFor: 'Visitors who still do not know whether the output matters',
          verdict: 'Upgrade when the same format is reused enough that setup drag becomes visible',
          pricingSignal: 'Paid starts earning its keep when reuse beats experimentation.',
          sourceIds: idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.competitive], 1),
        },
        {
          name: 'Batch publishing path',
          bestFor: 'Teams trying to keep pace with weekly or multi-channel clip output',
          notFor:
            workflowVolumeSignal?.detail
              ? 'Operators who still publish alone and do not yet have a standing review queue'
              : 'Operators who are still testing whether the workflow belongs in the stack',
          verdict: 'Pay for throughput once manual review and coordination outgrow the free path',
          pricingSignal: workflowVolumeSignal
            ? 'When quality control becomes a recurring workflow question, queue speed matters more than raw credits'
            : 'Batch production is usually where the free path stops being rational.',
          sourceIds:
            workflowVolumeSignal?.sourceIds ??
            idsFromRefs([...sourcePack.categories.official, ...sourcePack.categories.competitive], 1),
        },
        businessRoiSource
          ? {
              name: 'Business rollout path',
              bestFor: 'Teams that need multilingual delivery or broader stakeholder-ready output',
              notFor: 'Solo testers still validating a single clip concept',
              verdict: 'Upgrade when the buyer can point to a business case rather than just a nicer interface',
              pricingSignal: 'The paid unlock looks more real once ROI language such as 160+ languages or 90% time savings matters',
              sourceIds: [businessRoiSource.id],
            }
          : null,
      ],
      'name',
    )
  }

  function buildPageSpec(pageType, assetBinding, pageBrief) {
    const pageSourceRefs =
      pageType === 'faq'
        ? selectRefs([
            ...sourcePack.categories.serp,
            ...sourcePack.categories.community,
            ...deepResearchPages,
          ])
        : pageType === 'workflow'
          ? selectRefs([
              ...sourcePack.categories.workflow,
              ...sourcePack.categories.community,
              ...deepResearchPages,
            ])
          : ['pricing', 'free-vs-paid'].includes(pageType)
            ? selectRefs([
                ...sourcePack.categories.official,
                ...sourcePack.categories.workflow,
                ...sourcePack.categories.community,
                ...sourcePack.categories.competitive,
                ...sourcePack.categories.serp,
                ...deepResearchPages,
              ])
          : selectRefs([
              ...sourcePack.categories.official,
              ...sourcePack.categories.competitive,
              ...sourcePack.categories.serp,
              ...deepResearchPages,
            ])
    const primaryClaimIds = meaningfulList(pageBrief.primaryClaimIds).filter((id) => claimMap.has(id))
    const secondaryClaimIds = meaningfulList(pageBrief.secondaryClaimIds).filter((id) => claimMap.has(id))
    const claimIds = dedupe([
      ...primaryClaimIds,
      ...secondaryClaimIds,
    ])
    const claimCards = claimIds.map((id) => claimMap.get(id)).filter(Boolean)
    const common = {
      keyword: cluster.primaryKeyword,
      thesisKey: cluster.thesisKey,
      originalAnchors: originalAnchors.slice(0, 4),
      sourceReferences: pageSourceRefs,
      materialSlots: buildMaterialSlots(pageType, pageSourceRefs.map((ref) => sourceRefMap.get(ref.id))),
      commercialModules: buildCommercialModules(pageType),
      assetBinding,
      pageBrief: {
        ...pageBrief,
        primaryClaimIds,
        secondaryClaimIds,
      },
      briefId: pageBrief.id,
      claimIds,
      primaryClaimIds,
      claimCards,
      researchDossier,
      useCaseModels,
      researchDossierId: researchDossier.id,
      reviewSignals: {
        needsSpotCheck: ['hub', 'alternatives', 'workflow', 'template', 'case-study'].includes(pageType),
        reasons:
          ['hub', 'alternatives', 'workflow', 'template', 'case-study'].includes(pageType)
            ? ['Contains recommendations, ordering, or CTA language that benefits from a quick spot-check.']
            : [],
      },
    }

    if (pageType === 'hub') {
      return {
        ...common,
        slug: 'index',
        navLabel: 'Overview',
        type: 'hub',
        fileName: 'index.html',
        path: homePath,
        title: `${cluster.primaryKeyword} hub: tools, workflow and pricing`,
        metaDescription: `A decision page for ${cluster.primaryKeyword} with verdicts, shortlist logic, workflow guidance, and the right next asset for buyers.`,
        h1: `${cluster.primaryKeyword} hub`,
        intro: `Use this hub to decide whether ${cluster.primaryKeyword} deserves a place in your stack, which option to shortlist first, and what workflow to test next.`,
        coveredIntents: ['overview', 'comparison', 'workflow', 'pricing'],
        verdicts: [
          {
            title: 'Best for operators who need a decision surface, not another explainer',
            detail: `This cluster works when the buyer wants a shortlist, a workflow, and one asset that reduces execution friction.`,
            sourceIds: pageSourceRefs.slice(0, 2).map((item) => item.id),
          },
          {
            title: 'Weak pages lose visitors when they hide pricing clarity or rollout cost',
            detail: caveats[0],
            sourceIds: pageSourceRefs.slice(0, 2).map((item) => item.id),
          },
        ],
        keyFacts: [
          {
            label: 'Audience',
            value: cluster.audience,
            sourceIds: pageSourceRefs.slice(0, 1).map((item) => item.id),
          },
          {
            label: 'Monetization path',
            value: cluster.monetization.join(', '),
            sourceIds: pageSourceRefs.slice(0, 1).map((item) => item.id),
          },
          ...buildSignalFacts(1),
        ],
        sections: [
          {
            heading: 'Who this topic is for',
            paragraphs: [
              `The best ${cluster.primaryKeyword} pages help ${cluster.audience} move from curiosity to a concrete next step.`,
              `That means the page should tell the visitor who this category is for, who should skip it, and what to test first.`,
            ],
            bullets: [...bestFor, ...notFor.map((item) => `Not for: ${item}`)],
          },
          {
            heading: 'What the market still leaves unresolved',
            paragraphs: [
              `Current search coverage still leaves these gaps: ${research.gapSummary.gapOpportunities.join('; ') || 'buyers need a clearer operator-ready recommendation'}.`,
              `Use cases like ${useCases.slice(0, 3).join(', ')} should map to distinct decision paths rather than a single generic recommendation.`,
            ],
            bullets: research.suggestions.slice(0, 6),
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: assetBinding.copy,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'WebPage',
      }
    }

    if (pageType === 'faq') {
      const faqItems = dedupeBy(
        [
          ...research.faqCandidates,
          ...useCases.map((item) => ({ question: toQuestion(item), source: 'use-case' })),
        ].map((item) => ({
          question: item.question,
          answer: buildFaqAnswer(item.question),
          source: item.source,
        })),
        'question',
      ).slice(0, 6)

      return {
        ...common,
        slug: 'faq',
        navLabel: 'FAQ',
        type: 'faq',
        fileName: 'faq.html',
        path: `/generated-sites/${cluster.siteSlug}/faq.html`,
        title: `${cluster.primaryKeyword} FAQ: real questions, caveats, and next steps`,
        metaDescription: `Answer high-intent ${cluster.primaryKeyword} questions with grounded guidance on pricing, workflow, prompts, and rollout tradeoffs.`,
        h1: `${cluster.primaryKeyword} FAQ`,
        intro: `This FAQ page is for visitors who already have intent but still need one precise answer before they act.`,
        coveredIntents: ['overview', 'pricing', 'workflow', 'prompt'],
        faqItems,
        keyFacts: [
          {
            label: 'FAQ coverage',
            value: `${faqItems.length} query-shaped questions were collected for this page.`,
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'Top intents',
            value: research.topIntents.join(', '),
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'Open questions',
            value: research.gapSummary.gapOpportunities.slice(0, 2).join('; ') || 'Operators still need faster answers.',
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
        ],
        sections: [
          {
            heading: 'Questions worth answering early',
            paragraphs: [
              'FAQ pages should resolve real questions quickly, then send the visitor to the right decision or implementation page.',
            ],
            bullets: faqItems.map((item) => item.question),
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: assetBinding.copy,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'FAQPage',
      }
    }

    if (pageType === 'alternatives') {
      return {
        ...common,
        slug: 'alternatives',
        navLabel: 'Alternatives',
        type: 'alternatives',
        fileName: 'alternatives.html',
        path: `/generated-sites/${cluster.siteSlug}/alternatives.html`,
        title: `${cluster.primaryKeyword} alternatives: shortlist and tradeoffs`,
        metaDescription: `Compare ${cluster.primaryKeyword} alternatives with verdicts, best-for / not-for guidance, pricing clarity notes, and click-out next steps.`,
        h1: `${cluster.primaryKeyword} alternatives`,
        intro: `This page should help a buyer collapse a noisy field into a shortlist with one recommended first review and one fallback path.`,
        coveredIntents: ['comparison', 'pricing', 'overview'],
        verdicts: shortlistRows.slice(0, 2).map((row) => ({
          title: row.name,
          detail: `${row.verdict}. Best for ${row.bestFor.toLowerCase()}.`,
          sourceIds: row.sourceIds,
        })),
        decisionPaths: buildDecisionPaths(),
        evidenceCards: buildAlternativesEvidenceCards(),
        keyFacts: shortlistRows.slice(0, 3).map((row) => ({
          label: row.name,
          value: `${row.bestFor}. Watch-out: ${row.notFor}`,
          sourceIds: row.sourceIds,
        })),
        comparisonRows: shortlistRows,
        sections: [
          {
            heading: 'How to rank the shortlist',
            paragraphs: [
              `Collapse ${cluster.primaryKeyword} into one first click, one fallback, and one asset path for each serious buyer job.`,
              'Rank by buyer fit, implementation burden, and how quickly the visitor can turn the comparison into a repeatable decision record.',
            ],
            bullets: ['Time-to-value', 'Workflow friction', 'Pricing clarity', 'Reusable output quality'],
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: assetBinding.copy,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'ItemList',
      }
    }

    if (pageType === 'workflow') {
      return {
        ...common,
        slug: 'workflow',
        navLabel: 'Workflow',
        type: 'workflow',
        fileName: 'workflow.html',
        path: `/generated-sites/${cluster.siteSlug}/workflow.html`,
        title: `${cluster.primaryKeyword} workflow: steps, prompts and pitfalls`,
        metaDescription: `A practical ${cluster.primaryKeyword} workflow with steps, prompt examples, pitfalls, and the asset visitors can use after the first pilot.`,
        h1: `${cluster.primaryKeyword} workflow`,
        intro: `Implementation pages should remove ambiguity: what to input, what to output, what to measure, and what usually breaks first.`,
        coveredIntents: ['workflow', 'prompt', 'overview'],
        stepItems: workflowSteps,
        useCaseCards: buildUseCaseCards(),
        evidenceCards: buildWorkflowEvidenceCards(),
        assetPreview: (assetRouteMap.get(assetBinding.primary.slug)?.deliverables ?? []).slice(0, 3),
        examples: promptExamples,
        keyFacts: [
          {
            label: 'Workflow refs',
            value: `${sourcePack.sourceCounts.workflow} workflow references and ${promptExamples.length} prompt examples back this page.`,
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'Pilot target',
            value: `Start with ${useCases[0] ?? cluster.primaryKeyword} before expanding the surface area.`,
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'Primary risk',
            value: caveats[0],
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
        ],
        verdicts: [
          {
            title: 'Start with one pilot, not the whole workflow',
            detail: 'The fastest way to learn is to run one production-shaped pilot and turn the result into a repeatable asset.',
            sourceIds: pageSourceRefs.slice(0, 2).map((item) => item.id),
          },
        ],
        sections: [
          {
            heading: 'What a real workflow page must cover',
            paragraphs: [
              'A workflow page earns trust when it names the operating handoff, the review owner, and the failure point the team is likely to hit first.',
              'The page should leave the reader with one believable pilot and one asset they can reuse on the second run.',
            ],
            bullets: workflowSteps.map((item) => item.title),
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: assetBinding.copy,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'HowTo',
      }
    }

    if (pageType === 'best-of') {
      return {
        ...common,
        slug: 'best-tools',
        navLabel: 'Best Tools',
        type: 'best-tools',
        fileName: 'best-tools.html',
        path: `/generated-sites/${cluster.siteSlug}/best-tools.html`,
        title: `Best ${cluster.primaryKeyword} tools: shortlist by buyer fit`,
        metaDescription: `A best-of page for ${cluster.primaryKeyword} that groups tools by buyer fit, workflow maturity, and commercial readiness.`,
        h1: `Best ${cluster.primaryKeyword} tools`,
        intro: `Best-of pages should group options by fit so visitors can self-select quickly.`,
        coveredIntents: ['comparison', 'overview'],
        verdicts: shortlistRows.map((row) => ({
          title: row.name,
          detail: row.verdict,
          sourceIds: row.sourceIds,
        })),
        keyFacts: shortlistRows.map((row) => ({
          label: row.name,
          value: row.bestFor,
          sourceIds: row.sourceIds,
        })),
        sections: [
          {
            heading: 'How to use this shortlist',
            paragraphs: [
              'Use a best-of page to split the market by who should click first, not by who has the longest feature list.',
            ],
            bullets: shortlistRows.map((row) => `${row.name}: ${row.bestFor}`),
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: `Turn the shortlist into a reusable buyer asset with ${assetBinding.primary.title.toLowerCase()}.`,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'ItemList',
      }
    }

    if (pageType === 'pricing') {
      return {
        ...common,
        slug: 'pricing',
        navLabel: 'Pricing',
        type: 'pricing',
        fileName: 'pricing.html',
        path: `/generated-sites/${cluster.siteSlug}/pricing.html`,
        title: `${cluster.primaryKeyword} pricing: hidden costs and fit`,
        metaDescription: `A pricing page for ${cluster.primaryKeyword} explaining cost clarity, hidden workflow cost, and what buyers should compare before they click out.`,
        h1: `${cluster.primaryKeyword} pricing`,
        intro: `Pricing content should help the buyer estimate operating cost even when exact public pricing is incomplete. Use the visible price anchors, the weekly-workflow signals, and the reuse story to decide what this workflow really costs after the first pilot.`,
        coveredIntents: ['pricing', 'comparison'],
        verdicts: [
          {
            title: 'Use visible pricing as a floor, not the whole model',
            detail: pricingAnchorSnapshot.price
              ? `Treat the visible ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` benchmark for a ${pricingAnchorSnapshot.duration} workflow` : ' benchmark'} as the entry ticket for one clip, not as the weekly operating budget for the category.`
              : 'Visible plan names are only the floor price; the real model includes review, setup, and reuse cost.',
            sourceIds: pricingAnchor?.sourceIds ?? idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'The real upgrade trigger is weekly throughput and review load',
            detail: workflowVolumeSignal
              ? 'The upgrade moment arrives when the workflow enters a repeating review queue and approvals start taking longer than generation itself.'
              : 'The expensive part of the workflow usually appears when weekly throughput and review loops become real.',
            sourceIds: workflowVolumeSignal?.sourceIds ?? idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'Paid suites are really buying reuse and handoff speed',
            detail: automationScaleSource
              ? 'Paid workflow suites earn their keep when scheduling, shared approvals, and reusable prompt assets matter more than squeezing out the cheapest possible first pass.'
              : 'Paid starts making sense when reuse, scheduling, and approval speed matter more than raw experimentation.',
            sourceIds: automationScaleSource ? [automationScaleSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'Commercial buyers look for an ROI sentence',
            detail: businessRoiSource
              ? `The strongest paid proof is a ${businessRoiBrand} style ROI sentence with 160+ languages or major time savings, because that is how a budget owner justifies a workflow software line item.`
              : 'Commercial buyers need an ROI story, not just a prettier pricing table.',
            sourceIds: businessRoiSource ? [businessRoiSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
        ],
        useCaseCards: buildCommercialUseCaseCards(2),
        evidenceCards: buildPricingEvidenceCards(),
        assetPreview: (primaryAssetFlow?.deliverables ?? []).slice(0, 2).map((item) => ({
          label: item.label,
          detail: item.detail,
          href: primaryAssetFlow?.landingPath,
        })),
        deliveryFlow: primaryAssetFlow?.deliverySteps ?? [],
        keyFacts: [
          ...(pricingAnchor
            ? [
                {
                  label: 'Visible floor price',
                  value: pricingAnchorSnapshot.price
                    ? `${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}${pricingAnchorSnapshot.oneTime ? ', one-time payment' : ''}${pricingAnchorSnapshot.noSubscription ? ', no subscription shown' : ''}.`
                    : compactText(pricingAnchor.value, 140),
                  sourceIds: pricingAnchor.sourceIds,
                },
              ]
            : [
                {
                  label: 'Pricing clarity',
                  value: caveats[0],
                  sourceIds: idsFromRefs(pageSourceRefs, 2),
                },
              ]),
          {
            label: 'Upgrade trigger',
            value: workflowVolumeSignal
              ? 'The switch to paid usually happens when approvals, review latency, and weekly reuse cost more than another generation pass.'
              : 'Buyers usually upgrade when workflow reuse matters more than experimentation.',
            sourceIds: workflowVolumeSignal?.sourceIds ?? idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'Paid unlock',
            value: automationScaleSource
              ? 'Commercial value comes from shared workflow controls such as scheduling, approvals, and asset reuse.'
              : 'Review loops and rework often cost more than the sticker price.',
            sourceIds: automationScaleSource ? [automationScaleSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
          {
            label: 'ROI proof',
            value: businessRoiSource
              ? 'Look for business language like 160+ languages or up to 90% time-and-cost savings when judging the paid path.'
              : 'A believable paid page needs an ROI claim, not only feature bullets.',
            sourceIds: businessRoiSource ? [businessRoiSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
        ].slice(0, 5),
        comparisonRows: buildPricingComparisonRows(),
        examples: buildPricingExamples(),
        sections: [
          {
            heading: 'What to compare beyond sticker price',
            paragraphs: [
              pricingAnchorSnapshot.price
                ? `Start with the only hard number in the current pack: ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for a ${pricingAnchorSnapshot.duration} output` : ''}${pricingAnchorSnapshot.oneTime ? ', billed once' : ''}. That is enough to budget a first pilot, but not enough to forecast approvals, revisions, or reuse.`
                : 'Start with the few visible prices you can verify before you extrapolate a category-wide cost model.',
              workflowVolumeSignal
                ? 'If one person can plan, generate, review, and publish the clip in one sitting, the cheap path is fine. Once the workflow enters a weekly queue, hidden cost moves into approvals, handoffs, and version churn.'
                : 'Then compare the hidden line items: planning time, review loops, approval delays, and how much of the workflow can be reused next week.',
            ],
            bullets: ['Explicit public price', 'Usage-based risk', 'Reviewer hours', 'Reuse on the next launch'],
          },
          {
            heading: 'What paid is actually buying',
            paragraphs: [
              automationScaleSource
                ? `${automationScaleBrand} argues for the paid path with operational language such as autopilot, scheduling, and one workspace, while ROI claims like multilingual delivery or major time savings do the selling for ${businessRoiBrand || 'business-focused vendors'}. Both are selling workflow efficiency rather than a single render.`
                : 'The paid path earns its keep when the workflow outcome matters more than the cheapest possible first pass.',
              `For ${useCaseModels[0]?.label ?? cluster.primaryKeyword}, the practical paid unlock is a reusable prompt pack, a stable review rubric, and fewer approvals spread across chat, docs, and editors.`,
            ],
            bullets: ['Approval speed', 'Shared workspace', 'Repeatable prompt or template asset', 'Lower review drag'],
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: `Package the pricing evaluation into ${assetBinding.primary.title.toLowerCase()} so commercial-intent visitors can move without opening more tabs.`,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'WebPage',
      }
    }

    if (pageType === 'free-vs-paid') {
      return {
        ...common,
        slug: 'free-vs-paid',
        navLabel: 'Free vs Paid',
        type: 'free-vs-paid',
        fileName: 'free-vs-paid.html',
        path: `/generated-sites/${cluster.siteSlug}/free-vs-paid.html`,
        title: `${cluster.primaryKeyword} free vs paid: when the upgrade is worth it`,
        metaDescription: `Use this page to explain when free ${cluster.primaryKeyword} options break down and when a paid upgrade starts making sense.`,
        h1: `${cluster.primaryKeyword} free vs paid`,
        intro: `Free-vs-paid pages convert when they explain the upgrade trigger, not when they only repeat plan names. The useful comparison is whether a single launch clip has turned into a weekly workflow with a review queue and a reusable template asset.`,
        coveredIntents: ['pricing', 'comparison', 'workflow'],
        verdicts: [
          {
            title: 'Stay on the cheapest path while the job is still a one-off',
            detail: pricingAnchorSnapshot.price
              ? `Stay near-free while one person is validating one launch clip. A visible ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` benchmark for a ${pricingAnchorSnapshot.duration} output` : ' public benchmark'} is enough for that stage.`
              : 'The free path works while the team is still validating whether the workflow matters at all.',
            sourceIds: pricingAnchor?.sourceIds ?? idsFromRefs(pageSourceRefs, 1),
          },
          {
            title: 'Upgrade once the workflow looks like a weekly system',
            detail: workflowVolumeSignal
              ? 'Upgrade once the workflow stops being a solo experiment and becomes a recurring review queue that has to survive the next release, not just the next render.'
              : 'Paid starts making sense when the workflow repeats enough that setup, review, and approvals stop being edge cases.',
            sourceIds: workflowVolumeSignal?.sourceIds ?? idsFromRefs(pageSourceRefs, 1),
          },
          {
            title: 'Paid earns its keep when reuse beats experimentation',
            detail: automationScaleSource
              ? 'The paid path becomes rational when scheduling, shared approvals, and reusable workflow assets matter more than shaving a little cost off the first draft.'
              : 'Paid plans start making sense when the team has a repeatable use case, a clear owner, and a need for predictable output.',
            sourceIds: automationScaleSource ? [automationScaleSource.id] : idsFromRefs(pageSourceRefs, 1),
          },
          {
            title: 'The clearest paid unlock is a business case',
            detail: businessRoiSource
              ? `A buyer is far more likely to upgrade when the workflow needs ${businessRoiBrand} style proof such as localization, stakeholder-ready polish, or measurable time savings than when it just needs a nicer interface.`
              : 'A believable paid path needs a concrete business reason, not just plan envy.',
            sourceIds: businessRoiSource ? [businessRoiSource.id] : idsFromRefs(pageSourceRefs, 1),
          },
        ],
        useCaseCards: buildCommercialUseCaseCards(3),
        evidenceCards: buildPricingEvidenceCards(),
        assetPreview: (primaryAssetFlow?.deliverables ?? []).slice(0, 2).map((item) => ({
          label: item.label,
          detail: item.detail,
          href: primaryAssetFlow?.landingPath,
        })),
        deliveryFlow: primaryAssetFlow?.deliverySteps ?? [],
        keyFacts: [
          {
            label: 'Free path',
            value: 'Best for one user, one launch clip, and rough validation before the workflow earns a second run.',
            sourceIds: idsFromRefs(pageSourceRefs, 1),
          },
          {
            label: 'Paid path',
            value: 'Best when the workflow is recurring, shared, and judged by review speed, approvals, and reuse rather than by credits alone.',
            sourceIds: idsFromRefs(pageSourceRefs, 1),
          },
          {
            label: 'Decision trigger',
            value: workflowVolumeSignal
              ? 'Upgrade when consistency, handoff speed, and weekly reuse become harder than generation itself.'
              : 'Upgrade when collaboration, review speed, or output consistency become the bottleneck.',
            sourceIds: workflowVolumeSignal?.sourceIds ?? idsFromRefs(pageSourceRefs, 1),
          },
          ...(pricingAnchor
            ? [
                {
                  label: 'Visible benchmark',
                  value: pricingAnchorSnapshot.price
                    ? `${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}${pricingAnchorSnapshot.oneTime ? ', one-time payment' : ''}.`
                    : compactText(pricingAnchor.value, 120),
                  sourceIds: pricingAnchor.sourceIds,
                },
              ]
            : []),
          {
            label: 'Paid proof',
            value: businessRoiSource
              ? 'Look for business-language signals such as multilingual output or major time savings before recommending the paid tier.'
              : 'The paid tier needs a business case, not only a better dashboard.',
            sourceIds: businessRoiSource ? [businessRoiSource.id] : idsFromRefs(pageSourceRefs, 1),
          },
        ],
        comparisonRows: buildFreeVsPaidComparisonRows(),
        examples: buildFreeVsPaidExamples(),
        sections: [
          {
            heading: 'Where free usually breaks',
            paragraphs: [
              'Free usually holds up when one person can plan, generate, review, and publish the workflow in the same afternoon, without a shared queue or a reusable template asset.',
              workflowVolumeSignal
                ? 'The community signal here is operators comparing which workflow keeps quality usable as models change. That is usually when the bottleneck shifts from getting any output to keeping review speed and consistency stable.'
                : 'The free path usually breaks when quality review, throughput, or workflow reuse matter more than raw experimentation.',
            ],
            bullets: ['Single-user testing', 'No shared review queue', 'Low weekly volume', 'No need for reusable templates yet'],
          },
          {
            heading: 'What makes paid rational',
            paragraphs: [
              automationScaleSource
                ? `${automationScaleBrand} makes the paid workflow promise tangible with autopilot, scheduling, and one workspace, while ROI language such as multilingual delivery or major time savings makes the higher spend easier to defend for ${businessRoiBrand || 'business-focused tools'}.`
                : 'Paid becomes rational when the team is paying more in coordination drag than it would in software spend.',
              `For ${useCaseModels[0]?.label ?? cluster.primaryKeyword}, the upgrade is justified only after there is a standing workflow, a review owner, and at least one prompt or template asset that will be reused on the next release.`,
            ],
            bullets: ['Shared approvals', 'Batch throughput', 'Reusable prompt or template system', 'Faster handoff to the next launch'],
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: `Use ${assetBinding.primary.title.toLowerCase()} to document the real upgrade trigger instead of guessing from plan names alone.`,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'WebPage',
      }
    }

    if (pageType === 'use-case') {
      return {
        ...common,
        slug: 'use-cases',
        navLabel: 'Use Cases',
        type: 'use-cases',
        fileName: 'use-cases.html',
        path: `/generated-sites/${cluster.siteSlug}/use-cases.html`,
        title: `${cluster.primaryKeyword} use cases: who should use it and how`,
        metaDescription: `A use-case page for ${cluster.primaryKeyword} that maps different buyer jobs to the right workflow, template, or shortlist path.`,
        h1: `${cluster.primaryKeyword} use cases`,
        intro: `Use-case pages make the category feel concrete by tying it to a job, a trigger, and a measurable outcome.`,
        coveredIntents: ['overview', 'workflow'],
        useCaseCards: buildUseCaseCards(useCaseModels),
        keyFacts: useCaseModels.slice(0, 3).map((item, index) => ({
          label: `Use case ${index + 1}`,
          value: `${item.label} -> ${item.cta.title}`,
          sourceIds: item.sourceIds.length > 0 ? item.sourceIds : idsFromRefs(pageSourceRefs, 2),
        })),
        examples: useCaseModels.map((item) => ({
          title: item.label,
          body: `${item.trigger} Workflow: ${item.workflow} Outcome: ${item.outcome}`,
        })),
        sections: [
          {
            heading: 'Common production-shaped use cases',
            paragraphs: [
              'Use-case pages should feel like a researcher already narrowed the category into real operator jobs, not like a glossary shuffled into bullet points.',
              'Each card needs an audience, a trigger, a workflow, and a CTA path that makes the next move obvious.',
            ],
            bullets: useCases,
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: `Offer ${assetBinding.primary.title.toLowerCase()} so visitors can move from “this sounds relevant” to a concrete first test.`,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'WebPage',
      }
    }

    if (pageType === 'template') {
      return {
        ...common,
        slug: 'template-kit',
        navLabel: 'Template Kit',
        type: 'template-kit',
        fileName: 'template-kit.html',
        path: `/generated-sites/${cluster.siteSlug}/template-kit.html`,
        title: `${cluster.primaryKeyword} template kit: assets and prompts`,
        metaDescription: `A template and asset page for ${cluster.primaryKeyword} that explains what is included, who it is for, and how to use it after the first visit.`,
        h1: `${cluster.primaryKeyword} template kit`,
        intro: `The template kit bundles one first-run prompt pack, one repeat-run workflow checklist, and one comparison worksheet so a team can move from first pilot to reusable handoff without reopening search or rebuilding the brief.`,
        coveredIntents: ['prompt', 'workflow', 'overview'],
        verdicts: [
          {
            title: 'The kit should remove first-run setup, not add another download',
            detail: `The ${assetSystem.primaryAsset.title.toLowerCase()} only earns the click if it makes the first pilot faster to brief, review, and hand off.`,
            sourceIds: pricingAnchor?.sourceIds ?? idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'A real kit covers first run, second run, and the next buying decision',
            detail: `${assetSystem.primaryAsset.title}, ${assetSystem.secondaryAssets[0]?.title ?? 'the workflow checklist'}, and ${assetSystem.secondaryAssets[1]?.title ?? 'the comparison worksheet'} should each shorten a different stage of the workflow.`,
            sourceIds: idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'Reusable assets matter more once the workflow repeats',
            detail: automationScaleSource
              ? `${automationScaleBrand} style workflow promises around autopilot, scheduling, and one workspace only pay off when the underlying prompts, checklists, and review notes are reusable.`
              : 'Reusable assets matter once the workflow has a real owner and a real second run.',
            sourceIds: automationScaleSource ? [automationScaleSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
          {
            title: 'The kit becomes commercial when it supports a business case',
            detail: businessRoiSource
              ? `${businessRoiBrand} style ROI claims like 160+ languages or major time savings make the kit more valuable because cleaner prompts, clearer review, and better comparison notes support the higher-stakes workflow.`
              : 'A template kit gets stronger once it helps the buyer defend the next spend decision.',
            sourceIds: businessRoiSource ? [businessRoiSource.id] : idsFromRefs(pageSourceRefs, 2),
          },
        ],
        useCaseCards: buildUseCaseCards(
          useCaseModels.filter((model) => model.cta.assetSlug === assetBinding.primary.slug).length > 0
            ? useCaseModels.filter((model) => model.cta.assetSlug === assetBinding.primary.slug)
            : useCaseModels.slice(0, 3),
        ),
        evidenceCards: [
          {
            label: 'Three concrete assets',
            detail: `${assetDeliveryRecords.length} downloads cover the first run, the repeat run, and the next comparison decision: ${assetDeliveryRecords.map((asset) => asset.title).join(', ')}.`,
            href: assetRouteMap.get(assetBinding.primary.slug)?.landingPath ?? '',
          },
          {
            label: 'Five-step workflow backbone',
            detail: `${workflowSteps.length} workflow anchors already exist with owner, success metric, and failure point. The kit turns those workflow notes into something the next teammate can actually reuse.`,
            href: assetRouteMap.get(assetBinding.primary.slug)?.landingPath ?? '',
          },
          ...(pricingAnchorSnapshot.price
            ? [
                {
                  label: 'Visible pilot budget anchor',
                  detail: `A visible public benchmark still starts at ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for a ${pricingAnchorSnapshot.duration} workflow` : ''}${pricingAnchorSnapshot.oneTime ? ', one-time' : ''}. The kit should cut review waste and prompt thrash before it tries to justify a bigger workflow budget.`,
                  href: sourceRefMap.get(pricingAnchor?.sourceIds?.[0])?.url ?? '',
                },
              ]
            : []),
          ...(automationScaleSource || businessRoiSource
            ? [
                {
                  label: 'Commercial proof for reuse',
                  detail: `${automationScaleBrand || 'Workflow-suite vendors'} sell scheduling, shared workspace, and autopilot, while the ROI case comes from ${businessRoiBrand || 'business video tools'} through language such as multilingual delivery or major time savings. The kit exists to make that paid workflow reusable.`,
                  href: automationScaleSource?.url ?? businessRoiSource?.url ?? '',
                },
              ]
            : []),
        ].slice(0, 4),
        assetPreview: assetDeliveryRecords.map((asset) => ({
          label: asset.title,
          detail: `${asset.deliverables[0]?.detail ?? asset.summary}${asset.deliverables.length > 1 ? ` Includes ${asset.deliverables.length} concrete modules.` : ''}`,
          href: asset.landingPath,
        })),
        beforeAfter: [
          {
            label: 'Before the kit',
            detail: `Screenshots, release notes, pricing comparisons, and review comments stay scattered across tabs and docs when ${cluster.primaryKeyword} is still ad hoc.`,
          },
          {
            label: 'After the kit',
            detail: `One prompt pack, one checklist, and one worksheet give the next teammate a reusable starting point for the next ${cluster.primaryKeyword} cycle and the next buying decision.`,
          },
        ],
        deliveryFlow: [
          {
            title: 'Choose the first-run asset',
            detail: `${assetSystem.primaryAsset.title} handles the first production-shaped pilot; the secondary assets take over once review and comparison become the bottleneck.`,
          },
          {
            title: 'Unlock the pack and run one pilot',
            detail: `Use ${assetSystem.primaryAsset.title.toLowerCase()} on one narrow output before you spread the workflow across more channels or teammates.`,
          },
          {
            title: 'Document the repeat run',
            detail: `${assetSystem.secondaryAssets[0]?.title ?? 'The checklist'} captures owner, success metric, and failure point before the second pass turns messy.`,
          },
          {
            title: 'Score the next spend decision',
            detail: `${assetSystem.secondaryAssets[1]?.title ?? 'The worksheet'} logs pricing clarity, workflow drag, and reuse potential before the team commits to more tooling.`,
          },
        ],
        keyFacts: [
          {
            label: 'Asset bundle',
            value: `${assetDeliveryRecords.length} linked downloads cover first run, repeat run, and comparison.`,
            sourceIds: pageSourceRefs.slice(0, 1).map((item) => item.id),
          },
          {
            label: 'Primary asset depth',
            value: `${assetRouteMap.get(assetBinding.primary.slug)?.deliverables.length ?? 0} concrete modules ship inside ${assetSystem.primaryAsset.title.toLowerCase()}.`,
            sourceIds: idsFromRefs(pageSourceRefs, 1),
          },
          {
            label: 'Workflow backbone',
            value: `${workflowSteps.length} workflow steps already have owner, success metric, and failure point definitions.`,
            sourceIds: idsFromRefs(pageSourceRefs, 1),
          },
          {
            label: 'Use-case coverage',
            value: `${useCaseModels.length} use-case models already map audience, trigger, workflow, and outcome to the kit.`,
            sourceIds: idsFromRefs(pageSourceRefs, 1),
          },
          ...(pricingAnchor
            ? [
                {
                  label: 'Visible pilot benchmark',
                  value: pricingAnchorSnapshot.price
                    ? `${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}${pricingAnchorSnapshot.oneTime ? ', one-time payment' : ''}${pricingAnchorSnapshot.noSubscription ? ', no subscription shown' : ''}.`
                    : compactText(pricingAnchor.value, 120),
                  sourceIds: pricingAnchor.sourceIds,
                },
              ]
            : []),
        ],
        examples: [
          {
            title: 'First run',
            body: `Use the ${assetSystem.primaryAsset.title.toLowerCase()} to turn one source asset into a publish-ready short-form demo pilot faster, with a clearer hook, sequence, and CTA than a blank prompt field gives you.`,
          },
          {
            title: 'Second run',
            body: `Use the ${assetSystem.secondaryAssets[0]?.title.toLowerCase() ?? assetSystem.primaryAsset.title.toLowerCase()} to repeat the workflow without reopening research, renegotiating ownership, or losing the pass/fail threshold from the first review.`,
          },
          {
            title: 'Spend decision',
            body: `Use the ${assetSystem.secondaryAssets[1]?.title.toLowerCase() ?? 'comparison worksheet'} before the team buys more tooling so pricing clarity, review drag, and reuse potential are logged in one place.`,
          },
        ],
        sections: [
          {
            heading: 'Why the kit exists',
            paragraphs: [
              pricingAnchorSnapshot.price
                ? `A public benchmark still starts around ${pricingAnchorSnapshot.price}${pricingAnchorSnapshot.duration ? ` for ${pricingAnchorSnapshot.duration}` : ''}, so the first pilot should stay cheap. The kit earns its keep by reducing prompt thrash, review waste, and handoff confusion around that pilot.`
                : 'The first pilot should stay narrow and cheap. The kit earns its keep by reducing prompt thrash, review waste, and handoff confusion.',
              'The real value appears on the second run, when another teammate has to reuse the workflow, defend the shortlist, or compare the next tool without reopening five tabs.',
            ],
            bullets: [
              'One prompt pack for the first run',
              'One checklist for the repeat run',
              'One worksheet for the next buying decision',
            ],
          },
          {
            heading: 'What makes the kit product-shaped',
            paragraphs: [
              `${assetSystem.primaryAsset.title}, ${assetSystem.secondaryAssets[0]?.title ?? 'the workflow checklist'}, and ${assetSystem.secondaryAssets[1]?.title ?? 'the comparison worksheet'} each remove a different kind of drag: drafting, reviewing, and deciding.`,
              automationScaleSource
                ? `${automationScaleBrand} and ${businessRoiBrand || 'other ROI-led tools'} show why this matters: once the workflow is recurring, buyers pay for scheduling, shared workspace, multilingual delivery, and time savings. The kit needs to support that more serious workflow, not just hand out a download.`
                : 'The kit needs to feel like real operating work turned into reusable assets, not a decorative CTA shell.',
            ],
            bullets: [
              'Concrete modules inside each asset',
              'Named use cases tied to a real workflow',
              'Delivery steps that move from download to pilot to handoff',
            ],
          },
        ],
        ctaTitle: assetBinding.title,
        ctaCopy: `Make the asset the page, not an afterthought. ${assetBinding.primary.title} should feel like the concrete first-run move inside a reusable kit.`,
        ctaEvent: assetBinding.primary.event,
        schemaType: 'WebPage',
      }
    }

    return {
      ...common,
      slug: 'case-study',
      navLabel: 'Case Study',
      type: 'case-study',
      fileName: 'case-study.html',
      path: `/generated-sites/${cluster.siteSlug}/case-study.html`,
      title: `${cluster.primaryKeyword} case study: research to repeatable ops`,
      metaDescription: `A case-study style page showing how a team can move from scattered research into a reusable ${cluster.primaryKeyword} workflow and asset system.`,
      h1: `${cluster.primaryKeyword} case study`,
      intro: `Case-study pages earn trust by showing a believable before, a concrete intervention, and an outcome that maps back to the real workflow.`,
      coveredIntents: ['workflow', 'overview', 'comparison'],
      keyFacts: [
        {
          label: 'Before',
          value: 'No shortlist, no workflow, and no reusable asset for the next launch.',
          sourceIds: idsFromRefs(pageSourceRefs, 2),
        },
        {
          label: 'Intervention',
          value: 'Reduce the decision surface to one shortlist, one workflow, and one asset.',
          sourceIds: idsFromRefs(pageSourceRefs, 2),
        },
        {
          label: 'Outcome',
          value: 'The next cycle gets faster because the team reuses the winning path instead of starting from search again.',
          sourceIds: idsFromRefs(pageSourceRefs, 2),
        },
      ],
      examples: [
        {
          title: 'Before',
          body: `The team had demand around ${cluster.primaryKeyword} but no shortlist, no workflow, and no asset to reuse across launches.`,
        },
        {
          title: 'After',
          body: `They reduced the decision surface to one shortlist, one workflow, and one asset that made the next cycle faster.`,
        },
      ],
      beforeAfter: [
        {
          label: 'Before',
          detail: `No reusable asset existed for ${cluster.primaryKeyword}; each launch restarted the research and review loop.`,
        },
        {
          label: 'After',
          detail: `The winning path now lives in a prompt pack, checklist, or worksheet that can be handed to the next operator.`,
        },
      ],
      sections: [
        {
          heading: 'What changed between before and after',
          paragraphs: [
            'The useful case-study pattern is not “AI saved time.” It is “the team reduced decision overhead, clarified the workflow, and packaged the winning path into an asset.”',
          ],
          bullets: ['Shortlist created', 'Workflow documented', 'Asset packaged', 'Next step clarified'],
        },
      ],
      ctaTitle: assetBinding.title,
      ctaCopy: `If the visitor wants the same outcome faster, send them to ${assetBinding.primary.title.toLowerCase()} or a consult CTA.`,
      ctaEvent: assetBinding.primary.event,
      schemaType: 'WebPage',
    }
  }

  const sitePlaybookRule = contentPlaybookIndex?.siteRuleMap?.get(cluster.siteSlug) ?? null
  const sharedPlaybookContext = {
    cluster,
    research,
    sourcePack,
    assetSystem,
    claimLibrary,
    researchDossier,
    useCases,
    useCaseModels,
    shortlistRows,
    pricingSignals,
    caveats,
    promptExamples,
    workflowSteps,
    signalFacts: buildSignalFacts(3),
  }

  const pages = []
  const pageBriefs = []
  for (const pageType of cluster.pageTemplates) {
    const assetBinding = buildAssetBinding(pageType)
    const pageBrief = buildPageBrief(pageType, assetBinding)
    pageBriefs.push(pageBrief)
    let page = buildPageSpec(pageType, assetBinding, pageBrief)
    const aiDraft = await maybeGenerateAiPageDraft(page, sourcePack)
    if (aiDraft?.intro) page.intro = aiDraft.intro
    if (Array.isArray(aiDraft?.sectionNarratives)) {
      page.sections = page.sections.map((section, index) => ({
        ...section,
        paragraphs:
          aiDraft.sectionNarratives[index]?.paragraphs?.length > 0
            ? aiDraft.sectionNarratives[index].paragraphs
            : section.paragraphs,
        }))
    }
    if (aiDraft?.ctaCopy) page.ctaCopy = aiDraft.ctaCopy
    const pagePlaybookRule = contentPlaybookIndex?.pageTypeRuleMap?.get(page.type) ?? null
    page = applyContentPlaybook(page, pagePlaybookRule, sitePlaybookRule, sharedPlaybookContext)
    const override = reviewOverrideIndex?.get(`${cluster.siteSlug}/${page.slug}`)
    pages.push(applyReviewOverride(page, override))
  }

  const pageLinks = pages.map((page) => ({
    label: page.navLabel,
    path: page.path,
    fileName: page.fileName,
  }))
  const finalizedPages = pages.map((page) => {
    const narrativeStats = analyzePageNarrative(page)
    const workflowDetailCount = safeArray(page.stepItems).filter(
      (item) => item.input && item.output && item.owner && item.successMetric && item.failurePoint,
    ).length
    const proofModuleCount = [
      safeArray(page.decisionPaths).length > 0,
      safeArray(page.useCaseCards).length > 0,
      safeArray(page.evidenceCards).length > 0,
      safeArray(page.assetPreview).length > 0,
      safeArray(page.beforeAfter).length > 0,
      safeArray(page.deliveryFlow).length > 0,
    ].filter(Boolean).length

    return {
      ...page,
      draftEngine:
        contentConfig.aiProvider === 'heuristic' ||
        !contentConfig.aiEndpoint ||
        !contentConfig.aiApiKey ||
        !contentConfig.aiModel
          ? 'fact-synthesizer'
          : 'ai-provider',
      internalLinks: pageLinks.filter((link) => link.path !== page.path),
      ctaHref: assetRouteMap.get(page.assetBinding?.primary?.slug)?.landingPath ?? '',
      ctaEvent: 'asset_cta_click',
      contentStats: {
        factCount: page.keyFacts?.length ?? 0,
        verdictCount: page.verdicts?.length ?? 0,
        exampleCount: page.examples?.length ?? 0,
        caveatCount: caveats.length,
        sourceRefCount: page.sourceReferences?.length ?? 0,
        materialSlotCount: page.materialSlots?.length ?? 0,
        commercialModuleCount: page.commercialModules?.length ?? 0,
        claimCount: page.claimIds?.length ?? 0,
        claimStatementCount: safeArray(page.claimCards).filter((claim) => meaningfulText(claim?.statement)).length,
        claimEvidenceLineCount: safeArray(page.claimCards).reduce(
          (sum, claim) => sum + meaningfulList(claim?.evidence).length,
          0,
        ),
        primaryClaimCount: page.primaryClaimIds?.length ?? 0,
        briefSectionCount: page.pageBrief?.requiredSections?.length ?? 0,
        briefQuestionCount: safeArray(page.pageBrief?.mustWinQuestions).length,
        briefCompletenessScore: computePageBriefCompletenessScore(page.pageBrief),
        signalRichSourceCount: safeArray(page.sourceReferences).filter(
          (item) => !isLowSignalText(item.reason || item.label),
        ).length,
        lowSignalSourceCount: safeArray(page.sourceReferences).filter((item) =>
          isLowSignalText(item.reason || item.label),
        ).length,
        specificityScore: computePageSpecificityScore(page),
        repeatedSentenceCount: repeatedSentenceCount(
          [
            page.intro,
            ...safeArray(page.sections).flatMap((section) => safeArray(section.paragraphs)),
            ...safeArray(page.examples).map((item) => item.body),
          ]
            .filter(Boolean)
            .join(' '),
        ),
        dossierSignalCount:
          safeArray(page.researchDossier?.pricingSummary).length +
          safeArray(page.researchDossier?.communityPainSignals).length +
          safeArray(page.researchDossier?.changelogSignals).length,
        paragraphCount: narrativeStats.paragraphCount,
        genericPhraseCount: narrativeStats.genericPhraseCount,
        aiFlavorPhraseCount: narrativeStats.aiFlavorPhraseCount,
        genericParagraphCount: narrativeStats.genericParagraphCount,
        aiFlavorParagraphCount: narrativeStats.aiFlavorParagraphCount,
        lowEvidenceParagraphCount: narrativeStats.lowEvidenceParagraphCount,
        structuredUseCaseCount:
          safeArray(page.useCaseCards).length + safeArray(page.decisionPaths).length,
        decisionPathCount: safeArray(page.decisionPaths).length,
        evidenceCardCount: safeArray(page.evidenceCards).length,
        workflowDetailCount,
        assetPreviewCount: safeArray(page.assetPreview).length,
        beforeAfterCount: safeArray(page.beforeAfter).length,
        deliveryFlowCount: safeArray(page.deliveryFlow).length,
        proofModuleCount,
      },
    }
  })
  const conversionAssets = [assetSystem.primaryAsset, ...assetSystem.secondaryAssets].map((asset) => {
    const primaryPages = finalizedPages
      .filter((page) => page.assetBinding?.primary?.slug === asset.slug)
      .map((page) => page.slug)
    const routeRecord = assetRouteMap.get(asset.slug) ?? {}
    const acceptance = evaluateAssetAcceptance({
      ...routeRecord,
      primaryPages,
    })

    return {
      id: toWikiId('asset', cluster.siteSlug, asset.slug),
      slug: asset.slug,
      type: 'conversion_asset',
      thesisId: toWikiId('thesis', cluster.thesisKey),
      clusterId: toWikiId('cluster', cluster.siteSlug),
      assetKind:
        asset.type === 'template'
          ? 'template_pack'
          : asset.type === 'playbook'
            ? 'template_pack'
            : asset.type,
      status: 'active',
      intentStage:
        asset.event === 'generate_lead'
          ? 'consideration'
          : asset.event === 'download_checklist'
            ? 'implementation'
            : 'decision',
      deliveryMode: ['template', 'playbook'].includes(asset.type) ? 'download' : 'download',
      primaryPages,
      conversionEvent: asset.event,
      refreshCycle: 'monthly',
      title: asset.title,
      summary: asset.summary,
      promise: asset.summary,
      landingPath: routeRecord.landingPath ?? '',
      thankYouPath: routeRecord.thankYouPath ?? '',
      downloadPath: routeRecord.downloadPath ?? '',
      landingFileName: routeRecord.landingFileName ?? '',
      thankYouFileName: routeRecord.thankYouFileName ?? '',
      downloadFileName: routeRecord.downloadFileName ?? '',
      clickEvent: routeRecord.clickEvent ?? 'asset_cta_click',
      formEvent: routeRecord.formEvent ?? 'asset_form_submit',
      unlockEvent: routeRecord.unlockEvent ?? asset.event,
      deliveryEvent: routeRecord.deliveryEvent ?? 'asset_delivery',
      previewItems: routeRecord.previewItems ?? [],
      deliverables: routeRecord.deliverables ?? [],
      deliverySteps: routeRecord.deliverySteps ?? [],
      useCaseLabels: routeRecord.useCaseLabels ?? [],
      landingIntro: routeRecord.landingIntro ?? asset.summary,
      evidenceCards: routeRecord.evidenceCards ?? [],
      scenarioCards: routeRecord.scenarioCards ?? [],
      firstActionCards: routeRecord.firstActionCards ?? [],
      requestBullets: routeRecord.requestBullets ?? [],
      followUpPageSlugs: routeRecord.followUpPageSlugs ?? [],
      acceptanceChecks: routeRecord.acceptanceChecks ?? [],
      downloadMarkdown: routeRecord.downloadMarkdown ?? '',
      audience: routeRecord.audience ?? cluster.audience,
      acceptance,
      strongestUseCase: acceptance.strongestUseCase,
      bestPageTypes: acceptance.bestPageTypes,
      conversionQualityNote: acceptance.conversionQualityNote,
      refreshPriority: acceptance.refreshPriority,
      reuseScore: preferFiniteNumber(asset.reuseScore, computeAssetReuseScore({
        ...asset,
        deliverables: routeRecord.deliverables ?? [],
        primaryPages,
        useCaseLabels: routeRecord.useCaseLabels ?? [],
        bestPageTypes: acceptance.bestPageTypes,
        acceptanceStatus: acceptance.acceptanceStatus,
      })),
    }
  })

  return {
    pages: finalizedPages,
    claims: claimLibrary,
    pageBriefs,
    researchDossier,
    conversionAssets,
  }
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ')
}

function wordCount(value) {
  return stripHtml(value)
    .split(/\s+/)
    .filter(Boolean).length
}

function renderSchema(site, page, canonicalUrl) {
  if (page.schemaType === 'FAQPage' && page.faqItems) {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    }
  }

  if (page.schemaType === 'ItemList' && page.comparisonRows) {
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: page.comparisonRows.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: row.name,
        description: `${row.bestFor ?? row.strength ?? ''}. ${row.notFor ?? row.drawback ?? ''}. ${row.verdict ?? ''}`.trim(),
      })),
    }
  }

  if (page.schemaType === 'HowTo') {
    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: `${site.cluster.primaryKeyword} workflow`,
      step: (page.stepItems?.length ? page.stepItems.map((item) => item.title) : [
        'Choose the first pilot use case',
        'Define the success metric',
        'Create the comparison or checklist asset',
        'Launch the hub plus support pages',
        'Review clicks, conversions and expansion signals',
      ]).map((name, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        name,
      })),
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    url: canonicalUrl,
    about: site.cluster.primaryKeyword,
  }
}

function renderComparisonTable(rows) {
  if (!rows?.length) return ''

  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.bestFor ?? row.strength ?? '')}</td><td>${escapeHtml(row.notFor ?? row.drawback ?? '')}</td><td>${escapeHtml(row.verdict ?? row.pricingSignal ?? '')}</td></tr>`,
    )
    .join('')

  return `
    <section>
      <h2>Verdict table</h2>
      <table>
        <thead>
          <tr><th>Option</th><th>Best for</th><th>Not for</th><th>Verdict</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `
}

function renderVisualFigure(visualAsset, title, detail = '') {
  if (!visualAsset?.src && !visualAsset?.url) return ''

  return `
    <figure class="hero-visual" data-visual-mode="${escapeHtml(visualAsset.mode ?? 'unknown')}">
      <img src="${escapeHtml(visualAsset.src ?? visualAsset.url)}" alt="${escapeHtml(visualAsset.alt ?? title)}" loading="eager" decoding="async" />
      <figcaption>
        <strong>${escapeHtml(title)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      </figcaption>
    </figure>
  `
}

function renderFaq(page) {
  if (!page.faqItems?.length) return ''

  const items = page.faqItems
    .map(
      (item) => `
        <details>
          <summary>${escapeHtml(item.question)}</summary>
          <p>${escapeHtml(item.answer)}</p>
        </details>
      `,
    )
    .join('')

  return `<section><h2>FAQ</h2>${items}</section>`
}

function renderVerdictCards(page) {
  if (!page.verdicts?.length) return ''

  return `
    <section>
      <h2>Core verdicts</h2>
      <div class="card-grid">
        ${page.verdicts
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderFactGrid(page) {
  if (!page.keyFacts?.length) return ''

  return `
    <section>
      <h2>Key facts</h2>
      <div class="fact-grid">
        ${page.keyFacts
          .map(
            (item) => `
              <article class="mini-card">
                <span class="eyebrow">${escapeHtml(item.label)}</span>
                <p>${escapeHtml(item.value)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderWorkflowSteps(page) {
  if (!page.stepItems?.length) return ''

  return `
    <section>
      <h2>Step-by-step</h2>
      <div class="step-list">
        ${page.stepItems
          .map(
            (item, index) => `
              <article class="step-item">
                <strong>${index + 1}. ${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.detail)}</p>
                <dl class="step-meta">
                  <div><dt>Input</dt><dd>${escapeHtml(item.input ?? 'Not defined')}</dd></div>
                  <div><dt>Output</dt><dd>${escapeHtml(item.output ?? 'Not defined')}</dd></div>
                  <div><dt>Owner</dt><dd>${escapeHtml(item.owner ?? 'Not defined')}</dd></div>
                  <div><dt>Success metric</dt><dd>${escapeHtml(item.successMetric ?? 'Not defined')}</dd></div>
                  <div><dt>Failure point</dt><dd>${escapeHtml(item.failurePoint ?? 'Not defined')}</dd></div>
                </dl>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderUseCaseCards(page) {
  if (!page.useCaseCards?.length) return ''

  return `
    <section>
      <h2>Audience -> trigger -> workflow</h2>
      <div class="card-grid">
        ${page.useCaseCards
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p><span class="meta-label">Audience</span> ${escapeHtml(item.audience)}</p>
                <p><span class="meta-label">Trigger</span> ${escapeHtml(item.trigger)}</p>
                <p><span class="meta-label">Workflow</span> ${escapeHtml(item.workflow)}</p>
                <p><span class="meta-label">Outcome</span> ${escapeHtml(item.outcome)}</p>
                ${
                  item.ctaHref
                    ? `<p><a class="text-link" href="${escapeHtml(item.ctaHref)}">${escapeHtml(item.ctaTitle)}</a></p>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderDecisionPaths(page) {
  if (!page.decisionPaths?.length) return ''

  return `
    <section>
      <h2>Decision paths</h2>
      <div class="card-grid">
        ${page.decisionPaths
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p><span class="meta-label">Audience</span> ${escapeHtml(item.audience)}</p>
                <p><span class="meta-label">Trigger</span> ${escapeHtml(item.trigger)}</p>
                <p><span class="meta-label">Recommendation</span> ${escapeHtml(item.recommendation)}</p>
                <p><span class="meta-label">Watch-out</span> ${escapeHtml(item.watchOut)}</p>
                ${
                  item.ctaHref
                    ? `<p><a class="text-link" href="${escapeHtml(item.ctaHref)}">${escapeHtml(item.ctaTitle)}</a></p>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderAssetPreview(page) {
  if (!page.assetPreview?.length) return ''

  return `
    <section>
      <h2>Asset preview</h2>
      <div class="card-grid">
        ${page.assetPreview
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.label ?? item.title)}</strong>
                <p>${escapeHtml(item.detail ?? item.body ?? '')}</p>
                ${
                  item.href
                    ? `<p><a class="text-link" href="${escapeHtml(item.href)}">Open asset flow</a></p>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderEvidenceCards(page) {
  if (!page.evidenceCards?.length) return ''

  return `
    <section>
      <h2>Commercial evidence</h2>
      <div class="card-grid">
        ${page.evidenceCards
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.label)}</strong>
                <p>${escapeHtml(item.detail)}</p>
                ${
                  item.href
                    ? `<p><a class="text-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">Inspect source</a></p>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderBeforeAfter(page) {
  if (!page.beforeAfter?.length) return ''

  return `
    <section>
      <h2>Before / after</h2>
      <div class="card-grid">
        ${page.beforeAfter
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.label)}</strong>
                <p>${escapeHtml(item.detail)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderDeliveryFlow(page) {
  if (!page.deliveryFlow?.length) return ''

  return `
    <section>
      <h2>Delivery flow</h2>
      <div class="step-list">
        ${page.deliveryFlow
          .map(
            (item, index) => `
              <article class="step-item">
                <strong>${index + 1}. ${escapeHtml(item.title ?? item)}</strong>
                ${
                  typeof item === 'string'
                    ? ''
                    : `<p>${escapeHtml(item.detail ?? '')}</p>`
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderExamples(page) {
  if (!page.examples?.length) return ''

  return `
    <section>
      <h2>Examples</h2>
      <div class="card-grid">
        ${page.examples
          .map(
            (item) => `
              <article class="mini-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.body)}</p>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderMaterialSlots(page) {
  if (!page.materialSlots?.length) return ''

  return page.materialSlots
    .map(
      (slot) => `
        <section>
          <h2>${escapeHtml(slot.title)}</h2>
          <div class="card-grid">
            ${slot.items
              .map(
                (item) => `
                  <article class="mini-card">
                    <strong>${escapeHtml(item.label)}</strong>
                    <p>${escapeHtml(item.detail)}</p>
                    ${item.url ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">Open source</a></p>` : ''}
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')
}

function renderSourceReferences(page) {
  if (!page.sourceReferences?.length) return ''

  return `
    <section>
      <h2>Source references</h2>
      <ul>
        ${page.sourceReferences
          .map(
            (item) => `
              <li>
                <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.domain)}</a>
                ${item.reason ? ` - ${escapeHtml(item.reason)}` : ''}
              </li>
            `,
          )
          .join('')}
      </ul>
    </section>
  `
}

function renderCommercialModules(page) {
  if (!page.commercialModules?.length) return ''

  return page.commercialModules
    .map(
      (module) => `
        <section>
          <h2>${escapeHtml(module.title)}</h2>
          <p>${escapeHtml(module.description)}</p>
          <div class="card-grid">
            ${module.items
              .map(
                (item) => {
                  const isExternalUrl = /^https?:\/\//.test(item.url)
                  return `
                  <article class="mini-card">
                    <strong>${escapeHtml(item.label)}</strong>
                    <p>${escapeHtml(item.note)}</p>
                    <p>
                      <a
                        href="${escapeHtml(item.url)}"
                        ${isExternalUrl ? 'target="_blank" rel="noreferrer noopener"' : ''}
                        data-ga4-event="${escapeHtml(item.event)}"
                        data-ga4-label="${escapeHtml(item.label)}"
                      >
                        Open
                      </a>
                    </p>
                  </article>
                `
                },
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')
}

function renderSections(page) {
  return page.sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
          ${section.bullets?.length ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
        </section>
      `,
    )
    .join('')
}

function renderResearchBrief(page) {
  const brief = page.pageBrief
  if (!brief) return ''

  const goal = meaningfulText(brief.pageGoal)
  const visitorIntent = meaningfulText(brief.visitorIntent)
  const mustWinQuestions = meaningfulList(brief.mustWinQuestions)
  const requiredSections = meaningfulList(brief.requiredSections)
  const shouldRender =
    goal || visitorIntent || mustWinQuestions.length > 0 || requiredSections.length > 0

  if (!shouldRender) return ''

  return `
    <section>
      <h2>What this page must answer</h2>
      ${goal ? `<p>${escapeHtml(goal)}</p>` : ''}
      ${visitorIntent ? `<p>${escapeHtml(visitorIntent)}</p>` : ''}
      ${
        mustWinQuestions.length > 0
          ? `<ul>${mustWinQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : ''
      }
      ${
        requiredSections.length > 0
          ? `<p><span class="meta-label">Required sections</span> ${escapeHtml(requiredSections.join(', '))}</p>`
          : ''
      }
    </section>
  `
}

function renderClaimCards(page) {
  const claimCards = safeArray(page.claimCards)
    .filter(
      (claim) =>
        meaningfulText(claim?.statement) ||
        meaningfulText(claim?.whyItMatters) ||
        meaningfulList(claim?.evidence).length > 0,
    )
    .slice(0, 4)

  if (claimCards.length === 0) return ''

  return `
    <section>
      <h2>Research-backed claims</h2>
      <div class="card-grid">
        ${claimCards
          .map(
            (claim) => `
              <article class="mini-card">
                <p class="claim-meta">${escapeHtml(
                  `${titleCase(claim.claimKind || 'claim')} · ${titleCase(claim.decisionStage || 'discover')} · score ${preferFiniteNumber(claim.qualityScore, computeClaimQualityScore(claim))}`,
                )}</p>
                ${
                  meaningfulText(claim.statement)
                    ? `<strong>${escapeHtml(claim.statement)}</strong>`
                    : `<strong>${escapeHtml(titleCase(claim.claimKind || 'claim'))}</strong>`
                }
                ${meaningfulText(claim.whyItMatters) ? `<p>${escapeHtml(claim.whyItMatters)}</p>` : ''}
                ${
                  meaningfulList(claim.evidence).length > 0
                    ? `<ul class="mini-list">${meaningfulList(claim.evidence)
                        .slice(0, 3)
                        .map((item) => `<li>${escapeHtml(item)}</li>`)
                        .join('')}</ul>`
                    : ''
                }
                ${
                  meaningfulText(claim.counterpoint)
                    ? `<p class="mini-note"><span class="meta-label">Watch-out</span> ${escapeHtml(claim.counterpoint)}</p>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderOriginalAnchors(page) {
  if (!page.originalAnchors?.length) return ''

  return `
    <section>
      <h2>Original operator notes</h2>
      <ul>${page.originalAnchors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `
}

function renderInternalLinks(site, page) {
  const items = page.internalLinks
    .map(
      (link) => `<li><a href="${escapeHtml(path.basename(link.path))}">${escapeHtml(link.label)}</a></li>`,
    )
    .join('')

  return `
    <section>
      <h2>Keep the visitor moving</h2>
      <p>Every page in this cluster should send readers to the next-best decision surface instead of leaving them at a dead end.</p>
      <ul>${items}</ul>
    </section>
  `
}

function renderGa4Snippet(page, options = {}) {
  if (!googleConfig.ga4MeasurementId) return ''
  const readyEvents = normalizeCollection(options.readyEvents)

  return `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(googleConfig.ga4MeasurementId)}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = window.gtag || gtag;
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(googleConfig.ga4MeasurementId)}, {
        page_title: ${JSON.stringify(page.title)},
        page_path: ${JSON.stringify(page.path)},
        send_page_view: true
      });

      window.addEventListener('DOMContentLoaded', function () {
        ${readyEvents
          .map(
            (event) => `
        if (typeof window.gtag === 'function') {
          window.gtag('event', ${JSON.stringify(event.event)}, {
            page_path: ${JSON.stringify(page.path)},
            page_title: ${JSON.stringify(page.title)},
            event_label: ${JSON.stringify(event.label ?? '')},
            cta_title: ${JSON.stringify(page.ctaTitle ?? '')},
            ...${JSON.stringify(event.params ?? {})}
          });
        }`,
          )
          .join('\n')}

        document.querySelectorAll('[data-ga4-event]').forEach(function (element) {
          element.addEventListener('click', function () {
            if (typeof window.gtag !== 'function') return;
            window.gtag('event', element.dataset.ga4Event, {
              page_path: ${JSON.stringify(page.path)},
              page_title: ${JSON.stringify(page.title)},
              event_label: element.dataset.ga4Label || '',
              cta_title: ${JSON.stringify(page.ctaTitle)}
            });
          });
        });

        document.querySelectorAll('form[data-ga4-submit-event]').forEach(function (form) {
          form.addEventListener('submit', function () {
            if (typeof window.gtag !== 'function') return;
            window.gtag('event', form.dataset.ga4SubmitEvent, {
              page_path: ${JSON.stringify(page.path)},
              page_title: ${JSON.stringify(page.title)},
              event_label: form.dataset.ga4Label || '',
              cta_title: ${JSON.stringify(page.ctaTitle ?? '')}
            });
          });
        });
      });
    </script>
  `
}

function renderLeadCaptureSnippet(options) {
  if (!deliveryConfig.enabled) return ''

  return `
    <script>
      window.addEventListener('DOMContentLoaded', function () {
        var form = document.querySelector(${JSON.stringify(`[data-real-delivery-form="${options.formKind}"]`)});
        if (!form) return;

        var statusElement = form.querySelector('[data-form-status]');
        var submitButton = form.querySelector('button[type="submit"]');
        var config = ${JSON.stringify({
          apiBaseUrl: deliveryConfig.apiBaseUrl,
          endpoint: options.endpoint,
          formKind: options.formKind,
          siteSlug: options.siteSlug,
          sourcePage: options.sourcePage,
          landingPath: options.landingPath,
          thankYouPath: options.thankYouPath,
          assetSlug: options.assetSlug,
          assetTitle: options.assetTitle,
          offerTitle: options.offerTitle,
          ctaVariant: options.ctaVariant || options.formKind + '-primary-form',
          turnstileSiteKey: deliveryConfig.turnstileSiteKey,
          turnstileRequired: deliveryConfig.turnstileRequired,
        })};
        var widgetId = null;
        var firstTouchStorageKey = 'automiora:first-touch:v1';

        function setStatus(message, isError) {
          if (!statusElement) return;
          statusElement.hidden = !message;
          statusElement.textContent = message || '';
          statusElement.dataset.state = isError ? 'error' : 'info';
        }

        function setSubmittingState(isSubmitting) {
          if (!submitButton) return;
          submitButton.disabled = isSubmitting;
          submitButton.dataset.originalLabel = submitButton.dataset.originalLabel || submitButton.textContent || '';
          submitButton.textContent = isSubmitting ? 'Submitting...' : submitButton.dataset.originalLabel;
        }

        function safeJsonParse(value) {
          try {
            return JSON.parse(value);
          } catch (error) {
            return null;
          }
        }

        function currentUtmPayload() {
          var params = new URLSearchParams(window.location.search);
          var data = {};
          ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (key) {
            var value = String(params.get(key) || '').trim();
            if (value) data[key] = value;
          });
          return data;
        }

        function buildTouchPayload(kind) {
          return {
            kind: kind,
            href: window.location.href,
            path: window.location.pathname,
            title: document.title,
            referrer: document.referrer || '',
            timestamp: new Date().toISOString(),
            utm: currentUtmPayload()
          };
        }

        function readFirstTouch() {
          try {
            return safeJsonParse(window.localStorage.getItem(firstTouchStorageKey) || '');
          } catch (error) {
            return null;
          }
        }

        function ensureFirstTouch() {
          var existing = readFirstTouch();
          if (existing) return existing;
          var payload = buildTouchPayload('first_touch');
          try {
            window.localStorage.setItem(firstTouchStorageKey, JSON.stringify(payload));
          } catch (error) {}
          return payload;
        }

        function ensureTurnstile() {
          if (!config.turnstileSiteKey) return Promise.resolve();
          if (window.turnstile) return Promise.resolve();

          return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[data-turnstile-loader="true"]');
            if (existing) {
              existing.addEventListener('load', function () { resolve(); }, { once: true });
              existing.addEventListener('error', function () { reject(new Error('turnstile_load_failed')); }, { once: true });
              return;
            }

            var script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.dataset.turnstileLoader = 'true';
            script.addEventListener('load', function () { resolve(); }, { once: true });
            script.addEventListener('error', function () { reject(new Error('turnstile_load_failed')); }, { once: true });
            document.head.appendChild(script);
          });
        }

        function mountTurnstile() {
          if (!config.turnstileSiteKey || !window.turnstile) return;
          var slot = form.querySelector('[data-turnstile-slot]');
          if (!slot || slot.dataset.rendered === 'true') return;
          widgetId = window.turnstile.render(slot, {
            sitekey: config.turnstileSiteKey,
            theme: 'dark'
          });
          slot.dataset.rendered = 'true';
        }

        if (config.turnstileSiteKey) {
          ensureTurnstile()
            .then(function () { mountTurnstile(); })
            .catch(function () {
              setStatus('Verification widget failed to load. You can retry in a moment.', true);
            });
        }

        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          setStatus('', false);
          setSubmittingState(true);

          try {
            if (config.turnstileSiteKey && window.turnstile) {
              mountTurnstile();
            }

            var formData = new FormData(form);
            var turnstileToken = String(
              formData.get('cf-turnstile-response') || formData.get('turnstile_token') || ''
            ).trim();

            if (config.turnstileSiteKey && config.turnstileRequired && !turnstileToken) {
              setStatus('Please complete the verification before submitting.', true);
              setSubmittingState(false);
              return;
            }

            var payload = {
              email: String(formData.get('email') || '').trim(),
              role: String(formData.get('role') || '').trim(),
              siteSlug: config.siteSlug,
              sourcePage: config.sourcePage,
              landingPath: config.landingPath,
              thankYouPath: config.thankYouPath,
              turnstileToken: turnstileToken,
              ctaVariant: config.ctaVariant,
              attribution: {
                formKind: config.formKind,
                sourcePage: config.sourcePage,
                landingPath: config.landingPath,
                referrer: document.referrer || '',
                utm: currentUtmPayload()
              },
              firstTouch: ensureFirstTouch(),
              lastTouch: buildTouchPayload('last_touch')
            };

            if (config.formKind === 'asset') {
              payload.assetSlug = config.assetSlug;
              payload.assetTitle = config.assetTitle;
              payload.useCase = String(formData.get('use_case') || '').trim();
            } else {
              payload.offerTitle = config.offerTitle;
              payload.workflowBottleneck = String(formData.get('workflow_bottleneck') || '').trim();
              payload.desiredOutcome = String(formData.get('desired_outcome') || '').trim();
            }

            var response = await fetch(config.apiBaseUrl + config.endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            var result = {};
            try {
              result = await response.json();
            } catch (error) {
              result = {};
            }

            if (!response.ok || !result.redirectUrl) {
              throw new Error(result.error || 'submit_failed');
            }

            window.location.href = result.redirectUrl;
          } catch (error) {
            var message = error instanceof Error ? error.message : 'Submission failed.';
            setStatus(message, true);
            setSubmittingState(false);
            if (config.turnstileSiteKey && window.turnstile && widgetId !== null) {
              window.turnstile.reset(widgetId);
            }
          }
        });
      });
    </script>
  `
}

function renderAssetDeliverySnippet(asset) {
  if (!deliveryConfig.enabled) return ''

  return `
    <script>
      window.addEventListener('DOMContentLoaded', function () {
        var downloadLink = document.querySelector('[data-delivery-download-link]');
        if (!downloadLink) return;

        var config = ${JSON.stringify({
          apiBaseUrl: deliveryConfig.apiBaseUrl,
          fallbackHref: `downloads/${asset.downloadFileName}`,
        })};
        var params = new URLSearchParams(window.location.search);
        var token = params.get('delivery_token');
        var note = document.querySelector('[data-delivery-note]');
        var resendButton = document.querySelector('[data-delivery-resend-button]');
        var resendStatus = document.querySelector('[data-delivery-resend-status]');

        function setResendStatus(message, isError) {
          if (!resendStatus) return;
          resendStatus.hidden = !message;
          resendStatus.textContent = message || '';
          resendStatus.dataset.state = isError ? 'error' : 'info';
        }

        if (token) {
          downloadLink.href = config.apiBaseUrl + '/v1/deliver/' + encodeURIComponent(token);
          if (note) {
            note.hidden = false;
            note.textContent = 'This delivery link is tied to the request that just unlocked the asset.';
          }
        } else {
          downloadLink.href = config.fallbackHref;
          if (note) {
            note.hidden = false;
            note.textContent = 'Fallback download is active because no delivery token was present on this page load.';
          }
        }

        if (resendButton) {
          resendButton.hidden = !token;
          resendButton.addEventListener('click', async function () {
            if (!token) return;
            resendButton.disabled = true;
            setResendStatus('', false);
            try {
              var response = await fetch(
                config.apiBaseUrl + '/v1/deliver/' + encodeURIComponent(token) + '/resend',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                }
              );
              var result = {};
              try {
                result = await response.json();
              } catch (error) {
                result = {};
              }
              if (!response.ok || !result.deliveryToken) {
                throw new Error(result.error || 'resend_failed');
              }
              token = result.deliveryToken;
              downloadLink.href = config.apiBaseUrl + '/v1/deliver/' + encodeURIComponent(token);
              setResendStatus('A fresh delivery link was sent to the same email address.', false);
            } catch (error) {
              setResendStatus(error instanceof Error ? error.message : 'Resend failed.', true);
            } finally {
              resendButton.disabled = false;
            }
          });
        }
      });
    </script>
  `
}

function renderSiteHtml(site, page) {
  const canonicalUrl = new URL(page.path, `${config.baseUrl}/`).toString()
  const socialImage = page.visualAsset?.canonicalUrl ?? ''
  const schema = JSON.stringify(renderSchema(site, page, canonicalUrl))
  const ga4Snippet = renderGa4Snippet(page)
  const heroVisual = renderVisualFigure(
    page.visualAsset,
    `${site.cluster.label} visual`,
    page.assetBinding?.primary?.title
      ? `Primary next step: ${page.assetBinding.primary.title}`
      : site.cluster.primaryKeyword,
  )
  const navigation = site.pages
    .map((item) => {
      const href = item.slug === page.slug ? item.fileName : item.fileName
      const active = item.slug === page.slug ? ' class="active"' : ''
      const label = item.navLabel ?? titleCase(item.slug.replaceAll('-', ' '))
      return `<a${active} href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.metaDescription)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.metaDescription)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    ${socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.metaDescription)}" />
    ${socialImage ? `<meta name="twitter:image" content="${escapeHtml(socialImage)}" />` : ''}
    <script type="application/ld+json">${schema}</script>
${ga4Snippet}
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #171717;
        color: #efede7;
      }
      header, main, footer {
        width: min(980px, calc(100% - 32px));
        margin: 0 auto;
      }
      header {
        padding: 32px 0 18px;
      }
      .hero-shell {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
        align-items: start;
      }
      .hero-copy {
        min-width: 0;
      }
      .hero-shell--single {
        grid-template-columns: 1fr;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      nav a {
        color: #f3f1ea;
        text-decoration: none;
        padding: 6px 10px;
        border: 1px solid rgba(146, 188, 129, 0.35);
      }
      nav a.active {
        background: rgba(146, 188, 129, 0.12);
      }
      main {
        padding-bottom: 40px;
      }
      section {
        padding: 22px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      h1, h2, p, ul {
        margin: 0;
      }
      h1 {
        font-size: 2.55rem;
        line-height: 1.08;
        margin-bottom: 12px;
      }
      h2 {
        font-size: 1.18rem;
        margin-bottom: 10px;
      }
      p, li, td, th, summary {
        color: #d3cec3;
        line-height: 1.7;
      }
      p + p {
        margin-top: 12px;
      }
      ul {
        margin-top: 14px;
        padding-left: 20px;
      }
      .eyebrow {
        color: #8eb777;
        font-size: 0.82rem;
        text-transform: uppercase;
      }
      .lede {
        max-width: 64ch;
      }
      .hero-visual {
        margin: 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
        overflow: hidden;
      }
      .hero-visual img {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 2;
        object-fit: cover;
        background: #111;
      }
      .hero-visual figcaption {
        display: grid;
        gap: 6px;
        padding: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
      }
      .hero-visual figcaption strong {
        color: #f3f1ea;
      }
      .hero-visual figcaption span {
        color: #cfc8ba;
        font-size: 0.95rem;
        line-height: 1.6;
      }
      .cta {
        padding: 18px;
        border: 1px solid rgba(220, 180, 92, 0.32);
        background: rgba(220, 180, 92, 0.08);
      }
      .cta strong {
        display: block;
        margin-bottom: 10px;
        color: #f5e6b0;
      }
      .cta-button {
        display: inline-block;
        margin-top: 14px;
        border: 0;
        padding: 12px 16px;
        background: #dcb45c;
        color: #171717;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
      .cta-button:hover {
        background: #e7c36f;
      }
      .cluster-links {
        display: grid;
        gap: 8px;
      }
      .card-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .fact-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .mini-card,
      .step-item {
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
        padding: 14px;
      }
      .mini-card strong,
      .step-item strong {
        display: block;
        color: #f3f1ea;
        margin-bottom: 8px;
      }
      .step-list {
        display: grid;
        gap: 12px;
      }
      .step-meta {
        margin: 12px 0 0;
        display: grid;
        gap: 8px;
      }
      .step-meta div {
        display: grid;
        gap: 4px;
      }
      .step-meta dt,
      .meta-label {
        color: #9ac37f;
        font-size: 0.78rem;
        text-transform: uppercase;
      }
      .claim-meta {
        color: #9ac37f;
        font-size: 0.76rem;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .mini-list {
        margin-top: 10px;
      }
      .mini-note {
        margin-top: 10px;
      }
      .step-meta dd {
        margin: 0;
      }
      .text-link {
        color: #f5e6b0;
      }
      details {
        padding: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 14px;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      footer {
        padding: 0 0 32px;
        color: #b6b0a3;
      }
      @media (max-width: 720px) {
        h1 { font-size: 2rem; }
        .hero-shell {
          grid-template-columns: 1fr;
        }
        .card-grid,
        .fact-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="hero-shell${heroVisual ? '' : ' hero-shell--single'}">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(site.cluster.label)}</p>
          <h1>${escapeHtml(page.h1)}</h1>
          <p class="lede">${escapeHtml(page.intro)}</p>
          <nav>${navigation}</nav>
        </div>
        ${heroVisual}
      </div>
    </header>
    <main>
      ${renderSections(page)}
      ${renderResearchBrief(page)}
      ${renderClaimCards(page)}
      ${renderVerdictCards(page)}
      ${renderFactGrid(page)}
      ${renderDecisionPaths(page)}
      ${renderUseCaseCards(page)}
      ${renderWorkflowSteps(page)}
      ${renderEvidenceCards(page)}
      ${renderAssetPreview(page)}
      ${renderBeforeAfter(page)}
      ${renderDeliveryFlow(page)}
      ${renderExamples(page)}
      ${renderOriginalAnchors(page)}
      ${renderFaq(page)}
      ${renderComparisonTable(page.comparisonRows)}
      ${renderMaterialSlots(page)}
      ${renderCommercialModules(page)}
      ${renderSourceReferences(page)}
      ${renderInternalLinks(site, page)}
      <section class="cta">
        <strong>${escapeHtml(page.ctaTitle)}</strong>
        <p>${escapeHtml(page.ctaCopy)}</p>
        ${
          page.ctaHref
            ? `<a
                class="cta-button"
                href="${escapeHtml(page.ctaHref)}"
                data-ga4-event="${escapeHtml(page.ctaEvent ?? 'generate_lead')}"
                data-ga4-label="${escapeHtml(page.assetBinding?.primary?.title ?? site.cluster.ctaLabel)}"
              >
                ${escapeHtml(page.assetBinding?.primary?.title ?? site.cluster.ctaLabel)}
              </a>`
            : `<button
                class="cta-button"
                type="button"
                data-ga4-event="${escapeHtml(page.ctaEvent ?? 'generate_lead')}"
                data-ga4-label="${escapeHtml(page.assetBinding?.primary?.title ?? site.cluster.ctaLabel)}"
              >
                ${escapeHtml(page.assetBinding?.primary?.title ?? site.cluster.ctaLabel)}
              </button>`
        }
      </section>
    </main>
    <footer>
      <p>Built from the ${escapeHtml(site.cluster.label)} cluster. Track this page through the pipeline dashboard for audit, SEO, and lifecycle decisions.</p>
    </footer>
  </body>
</html>`

  return {
    html,
    canonicalUrl,
    titleLength: page.title.length,
    descriptionLength: page.metaDescription.length,
    wordCount: wordCount(html),
  }
}

function renderAssetLandingHtml(site, asset) {
  const canonicalUrl = new URL(asset.landingPath, `${config.baseUrl}/`).toString()
  const socialImage = asset.visualAsset?.canonicalUrl ?? ''
  const heroVisual = renderVisualFigure(
    asset.visualAsset,
    `${asset.title} preview`,
    asset.deliverables?.[0]?.label
      ? `Includes ${asset.deliverables[0].label.toLowerCase()}`
      : 'Reusable workflow asset',
  )
  const ga4Snippet = renderGa4Snippet(
    {
      title: `${asset.title} delivery`,
      path: asset.landingPath,
      ctaTitle: asset.title,
    },
    {},
  )
  const leadCaptureSnippet = renderLeadCaptureSnippet({
    formKind: 'asset',
    endpoint: '/v1/asset-leads',
    siteSlug: site.siteSlug,
    sourcePage: asset.landingPath,
    landingPath: asset.landingPath,
    thankYouPath: asset.thankYouPath,
    assetSlug: asset.slug,
    assetTitle: asset.title,
    ctaVariant: `asset-${asset.slug}-form`,
  })
  const relatedPageSlugs =
    safeArray(asset.followUpPageSlugs).length > 0 ? asset.followUpPageSlugs : asset.primaryPages
  const relatedPages = relatedPageSlugs
    .map((slug) => site.pages.find((page) => page.slug === slug))
    .filter(Boolean)
  const evidenceCards = safeArray(asset.evidenceCards)
  const scenarioCards = safeArray(asset.scenarioCards)
  const firstActionCards = safeArray(asset.firstActionCards)
  const requestBullets = safeArray(asset.requestBullets)

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(asset.title)} delivery</title>
    <meta name="description" content="${escapeHtml(asset.summary)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    ${socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(asset.title)} delivery" />
    <meta name="twitter:description" content="${escapeHtml(asset.summary)}" />
    ${socialImage ? `<meta name="twitter:image" content="${escapeHtml(socialImage)}" />` : ''}
${ga4Snippet}
${leadCaptureSnippet}
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #171717; color: #efede7; }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 48px; }
      section { padding: 22px 0; border-top: 1px solid rgba(255,255,255,0.12); }
      h1, h2, p, ul { margin: 0; }
      h1 { font-size: 2.4rem; line-height: 1.08; margin-bottom: 12px; }
      h2 { font-size: 1.08rem; margin-bottom: 10px; }
      p, li, label, input, textarea { color: #d3cec3; line-height: 1.7; }
      .eyebrow { color: #8eb777; font-size: 0.82rem; text-transform: uppercase; margin-bottom: 8px; }
      .hero-shell { display: grid; gap: 24px; grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr); align-items: start; }
      .hero-shell--single { grid-template-columns: 1fr; }
      .lede { max-width: 64ch; }
      .kicker { margin-top: 10px; color: #f5e6b0; max-width: 64ch; }
      .hero-visual {
        margin: 0;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        overflow: hidden;
      }
      .hero-visual img {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 2;
        object-fit: cover;
        background: #111;
      }
      .hero-visual figcaption {
        display: grid;
        gap: 6px;
        padding: 14px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
      }
      .hero-visual figcaption strong { color: #f3f1ea; }
      .hero-visual figcaption span { color: #d3cec3; font-size: 0.95rem; line-height: 1.6; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); padding: 14px; }
      .card strong { display: block; color: #f3f1ea; margin-bottom: 8px; }
      .form-shell {
        display: grid;
        gap: 18px;
        border: 1px solid rgba(220,180,92,0.28);
        background: rgba(220,180,92,0.06);
        padding: 16px;
      }
      .turnstile-shell { min-height: 66px; }
      .form-status {
        font-size: 0.92rem;
        color: #d3cec3;
      }
      .form-status[data-state="error"] { color: #f7b0a2; }
      form { display: grid; gap: 12px; max-width: 560px; }
      input, textarea {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.03);
        color: #efede7;
        padding: 12px;
        font: inherit;
      }
      button, a.button {
        display: inline-block;
        border: 0;
        padding: 12px 16px;
        background: #dcb45c;
        color: #171717;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
      .text-link { color: #f5e6b0; }
      .note-list { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
      ul { padding-left: 20px; }
      @media (max-width: 720px) {
        .hero-shell { grid-template-columns: 1fr; }
        .grid { grid-template-columns: 1fr; }
        h1 { font-size: 2rem; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="hero-shell${heroVisual ? '' : ' hero-shell--single'}">
        <div>
          <p class="eyebrow">${escapeHtml(site.cluster.label)}</p>
          <h1>${escapeHtml(asset.title)}</h1>
          <p class="lede">${escapeHtml(asset.landingIntro ?? asset.summary)}</p>
          <p class="kicker">${escapeHtml(`Best for ${asset.useCaseLabels.slice(0, 3).join(', ') || site.cluster.primaryKeyword}.`)}</p>
        </div>
        ${heroVisual}
      </div>

      ${
        evidenceCards.length > 0
          ? `<section>
        <h2>Why this asset is worth taking now</h2>
        <div class="grid">
          ${evidenceCards
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                  ${
                    item.href
                      ? `<p><a class="text-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">Inspect source</a></p>`
                      : ''
                  }
                </article>
              `,
            )
            .join('')}
        </div>
      </section>`
          : ''
      }

      ${
        scenarioCards.length > 0
          ? `<section>
        <h2>Where this fits in the workflow</h2>
        <div class="grid">
          ${scenarioCards
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      </section>`
          : ''
      }

      <section>
        <h2>What gets unlocked</h2>
        <div class="grid">
          ${asset.deliverables
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      </section>

      <section>
        <h2>What you can inspect before opting in</h2>
        <div class="grid">
          ${asset.previewItems
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      </section>

      <section>
        <h2>First 30 minutes after download</h2>
        <div class="grid">
          ${(firstActionCards.length > 0 ? firstActionCards : asset.deliverySteps)
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      </section>

      <section>
        <h2>Request the asset</h2>
        <div class="form-shell">
          <p>Unlock the markdown download, run one narrow pilot, and keep the workflow notes that make the second run faster than the first.</p>
          <form
            method="GET"
            action="${escapeHtml(path.basename(asset.thankYouPath))}"
            data-ga4-submit-event="${escapeHtml(asset.formEvent)}"
            data-ga4-label="${escapeHtml(asset.title)}"
            data-real-delivery-form="asset"
          >
            <label>
              Work email
              <input type="email" name="email" placeholder="you@company.com" required />
            </label>
            <label>
              Team or role
              <input type="text" name="role" placeholder="Product marketing, growth, ops..." required />
            </label>
            <label>
              First use case
              <textarea name="use_case" rows="4" placeholder="${escapeHtml(asset.useCaseLabels[0] ?? `What are you trying to do with ${site.cluster.primaryKeyword}?`)}" required></textarea>
            </label>
            <div class="turnstile-shell" data-turnstile-slot></div>
            <p class="form-status" data-form-status hidden></p>
            <input type="hidden" name="asset" value="${escapeHtml(asset.slug)}" />
            <button
              type="submit"
              data-ga4-event="${escapeHtml(asset.clickEvent)}"
              data-ga4-label="${escapeHtml(asset.title)}"
            >
              Unlock ${escapeHtml(asset.title)}
            </button>
          </form>
          ${
            requestBullets.length > 0
              ? `<ul class="note-list">${requestBullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
              : ''
          }
        </div>
      </section>

      ${
        relatedPages.length > 0
          ? `<section><h2>Best companion pages</h2><ul>${relatedPages
              .map(
                (page) =>
                  `<li><a class="text-link" href="${escapeHtml(path.basename(page.path))}">${escapeHtml(page.navLabel ?? page.slug)}</a></li>`,
              )
              .join('')}</ul></section>`
          : ''
      }
    </main>
  </body>
</html>`

  return { html, canonicalUrl, titleLength: asset.title.length, descriptionLength: asset.summary.length }
}

function renderAssetThankYouHtml(site, asset) {
  const canonicalUrl = new URL(asset.thankYouPath, `${config.baseUrl}/`).toString()
  const socialImage = asset.visualAsset?.canonicalUrl ?? ''
  const heroVisual = renderVisualFigure(
    asset.visualAsset,
    `${asset.title} ready`,
    asset.deliverySteps?.[0]?.title
      ? `Start with ${asset.deliverySteps[0].title.toLowerCase()}`
      : 'Reusable workflow asset',
  )
  const readyEvents = [
    {
      event: asset.formEvent,
      label: asset.title,
      params: {
        asset_slug: asset.slug,
        asset_kind: asset.assetKind ?? asset.type,
        stage: 'submit',
      },
    },
    {
      event: asset.unlockEvent,
      label: asset.title,
      params: {
        asset_slug: asset.slug,
        asset_kind: asset.assetKind ?? asset.type,
        stage: 'unlock',
      },
    },
    ...(asset.unlockEvent === 'generate_lead'
      ? []
      : [
          {
            event: 'generate_lead',
            label: asset.title,
            params: {
              asset_slug: asset.slug,
              asset_kind: asset.assetKind ?? asset.type,
              stage: 'lead_alias',
            },
          },
        ]),
  ]
  const ga4Snippet = renderGa4Snippet(
    {
      title: `${asset.title} ready`,
      path: asset.thankYouPath,
      ctaTitle: asset.title,
    },
    { readyEvents },
  )
  const assetDeliverySnippet = renderAssetDeliverySnippet(asset)
  const relatedPageSlugs =
    safeArray(asset.followUpPageSlugs).length > 0 ? asset.followUpPageSlugs : asset.primaryPages
  const relatedPages = relatedPageSlugs
    .map((slug) => site.pages.find((page) => page.slug === slug))
    .filter(Boolean)
  const evidenceCards = safeArray(asset.evidenceCards)
  const firstActionCards = safeArray(asset.firstActionCards)

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(asset.title)} ready</title>
    <meta name="description" content="${escapeHtml(`Download ${asset.title} and move straight into the first pilot.`)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    ${socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(asset.title)} ready" />
    <meta name="twitter:description" content="${escapeHtml(`Download ${asset.title} and move straight into the first pilot.`)}" />
    ${socialImage ? `<meta name="twitter:image" content="${escapeHtml(socialImage)}" />` : ''}
${ga4Snippet}
${assetDeliverySnippet}
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #171717; color: #efede7; }
      main { width: min(820px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 48px; }
      section { padding: 22px 0; border-top: 1px solid rgba(255,255,255,0.12); }
      h1, h2, p, ul { margin: 0; }
      h1 { font-size: 2.2rem; line-height: 1.08; margin-bottom: 12px; }
      h2 { font-size: 1.05rem; margin-bottom: 10px; }
      p, li { color: #d3cec3; line-height: 1.7; }
      .eyebrow { color: #8eb777; font-size: 0.82rem; text-transform: uppercase; margin-bottom: 8px; }
      .hero-shell { display: grid; gap: 24px; grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr); align-items: start; }
      .hero-shell--single { grid-template-columns: 1fr; }
      .lede { max-width: 62ch; }
      .hero-visual {
        margin: 0;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        overflow: hidden;
      }
      .hero-visual img {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 2;
        object-fit: cover;
        background: #111;
      }
      .hero-visual figcaption {
        display: grid;
        gap: 6px;
        padding: 14px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
      }
      .hero-visual figcaption strong { color: #f3f1ea; }
      .hero-visual figcaption span { color: #d3cec3; font-size: 0.95rem; line-height: 1.6; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); padding: 14px; }
      .card strong { display: block; color: #f3f1ea; margin-bottom: 8px; }
      .button {
        display: inline-block;
        margin-top: 14px;
        padding: 12px 16px;
        background: #dcb45c;
        color: #171717;
        text-decoration: none;
        font-weight: 700;
      }
      .secondary-button {
        display: inline-block;
        margin-top: 10px;
        padding: 11px 14px;
        border: 1px solid rgba(255,255,255,0.16);
        background: transparent;
        color: #efede7;
        text-decoration: none;
        font-weight: 600;
        cursor: pointer;
      }
      .delivery-note {
        margin-top: 10px;
        font-size: 0.92rem;
        color: #d3cec3;
      }
      .delivery-note[data-state="error"] {
        color: #f7b0a2;
      }
      .text-link { color: #f5e6b0; }
      ul { padding-left: 20px; }
      @media (max-width: 720px) {
        .hero-shell { grid-template-columns: 1fr; }
        .grid { grid-template-columns: 1fr; }
        h1 { font-size: 1.95rem; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="hero-shell${heroVisual ? '' : ' hero-shell--single'}">
        <div>
          <p class="eyebrow">${escapeHtml(site.cluster.label)}</p>
          <h1>${escapeHtml(asset.title)} is ready</h1>
          <p class="lede">Download the asset, use the first module on one narrow pilot, and keep the workflow notes that make the second run cleaner than the first.</p>
        </div>
        ${heroVisual}
      </div>

      <section>
        <h2>Start here in the first 30 minutes</h2>
        <div class="grid">
          ${(firstActionCards.length > 0 ? firstActionCards : asset.deliverySteps)
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
        <a
          class="button"
          href="${escapeHtml(`downloads/${asset.downloadFileName}`)}"
          download
          data-ga4-event="${escapeHtml(asset.deliveryEvent)}"
          data-ga4-label="${escapeHtml(asset.title)}"
          data-delivery-download-link
        >
          Download ${escapeHtml(asset.title)}
        </a>
        <button class="secondary-button" type="button" data-delivery-resend-button hidden>
          Send me a fresh delivery link
        </button>
        <p class="delivery-note" data-delivery-note hidden></p>
        <p class="delivery-note" data-delivery-resend-status hidden></p>
      </section>

      <section>
        <h2>What is inside</h2>
        <div class="grid">
          ${asset.deliverables
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                </article>
              `,
            )
            .join('')}
        </div>
      </section>

      ${
        evidenceCards.length > 0
          ? `<section>
        <h2>Why this asset should help</h2>
        <div class="grid">
          ${evidenceCards
            .map(
              (item) => `
                <article class="card">
                  <strong>${escapeHtml(item.label)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                  ${
                    item.href
                      ? `<p><a class="text-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">Inspect source</a></p>`
                      : ''
                  }
                </article>
              `,
            )
            .join('')}
        </div>
      </section>`
          : ''
      }

      ${
        relatedPages.length > 0
          ? `<section>
        <h2>Pair it with these pages</h2>
        <ul>${relatedPages
          .map(
            (page) =>
              `<li><a class="text-link" href="${escapeHtml(path.basename(page.path))}">${escapeHtml(page.navLabel ?? page.slug)}</a></li>`,
          )
          .join('')}</ul>
      </section>`
          : ''
      }
    </main>
  </body>
</html>`

  return { html, canonicalUrl }
}

function buildConsultOfferRecord(site) {
  return {
    slug: 'audit-request',
    title: `${site.cluster.label} audit request`,
    summary: `Request a narrower workflow audit for ${site.cluster.primaryKeyword} and move from browsing into a scoped implementation conversation.`,
    landingPath: `/generated-sites/${site.siteSlug}/audit-request.html`,
    thankYouPath: `/generated-sites/${site.siteSlug}/audit-request-thank-you.html`,
    landingFileName: 'audit-request.html',
    thankYouFileName: 'audit-request-thank-you.html',
    clickEvent: 'consult_click',
    submitEvent: 'consult_request_submit',
    readyEvent: 'consult_request_ready',
    commercialEvent: 'consult_interest',
    followUpPages: ['case-study', 'workflow', 'template-kit'],
  }
}

function renderConsultOfferHtml(site, offer) {
  const canonicalUrl = new URL(offer.landingPath, `${config.baseUrl}/`).toString()
  const ga4Snippet = renderGa4Snippet(
    {
      title: offer.title,
      path: offer.landingPath,
      ctaTitle: offer.title,
    },
    {},
  )
  const leadCaptureSnippet = renderLeadCaptureSnippet({
    formKind: 'consult',
    endpoint: '/v1/consult-requests',
    siteSlug: site.siteSlug,
    sourcePage: offer.landingPath,
    landingPath: offer.landingPath,
    thankYouPath: offer.thankYouPath,
    offerTitle: offer.title,
    ctaVariant: `consult-${offer.slug}-form`,
  })
  const relatedPages = offer.followUpPages
    .map((slug) => site.pages.find((page) => page.slug === slug))
    .filter(Boolean)
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(offer.title)}</title>
    <meta name="description" content="${escapeHtml(offer.summary)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${ga4Snippet}
${leadCaptureSnippet}
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #171717; color: #efede7; }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 48px; }
      section { padding: 22px 0; border-top: 1px solid rgba(255,255,255,0.12); }
      h1, h2, p, ul { margin: 0; }
      h1 { font-size: 2.35rem; line-height: 1.08; margin-bottom: 12px; }
      h2 { font-size: 1.08rem; margin-bottom: 10px; }
      p, li, label, input, textarea { color: #d3cec3; line-height: 1.7; }
      .eyebrow { color: #8eb777; font-size: 0.82rem; text-transform: uppercase; margin-bottom: 8px; }
      .lede { max-width: 64ch; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); padding: 14px; }
      .card strong { display: block; color: #f3f1ea; margin-bottom: 8px; }
      .form-shell {
        display: grid;
        gap: 18px;
        border: 1px solid rgba(220,180,92,0.28);
        background: rgba(220,180,92,0.06);
        padding: 16px;
      }
      .turnstile-shell { min-height: 66px; }
      .form-status {
        font-size: 0.92rem;
        color: #d3cec3;
      }
      .form-status[data-state="error"] { color: #f7b0a2; }
      form { display: grid; gap: 12px; max-width: 620px; }
      input, textarea {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.03);
        color: #efede7;
        padding: 12px;
        font: inherit;
      }
      button {
        display: inline-block;
        border: 0;
        padding: 12px 16px;
        background: #dcb45c;
        color: #171717;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .text-link { color: #f5e6b0; }
      ul { padding-left: 20px; }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        h1 { font-size: 2rem; }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${escapeHtml(site.cluster.label)}</p>
      <h1>${escapeHtml(offer.title)}</h1>
      <p class="lede">Use this form when the visitor does not only need a download. It is for teams that already know the workflow matters and want help narrowing the first implementation move, the review bottleneck, or the commercial decision.</p>

      <section>
        <h2>What this audit should resolve</h2>
        <div class="grid">
          <article class="card">
            <strong>Where the workflow breaks first</strong>
            <p>Name the real handoff, review, or output-quality failure instead of asking for a generic audit.</p>
          </article>
          <article class="card">
            <strong>Which asset or path should be used next</strong>
            <p>Route the team into the right prompt pack, checklist, worksheet, or implementation path without another research loop.</p>
          </article>
          <article class="card">
            <strong>Whether free is still enough</strong>
            <p>Clarify if the bottleneck is tooling, workflow design, or reviewer overhead before anyone buys another plan.</p>
          </article>
          <article class="card">
            <strong>What the next two weeks should look like</strong>
            <p>Translate the audit into a small next-step plan the team can actually run.</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Request the audit</h2>
        <div class="form-shell">
          <p>Ask for a scoped audit when the team already has a live workflow question and a named owner for the next step.</p>
          <form
            method="GET"
            action="${escapeHtml(offer.thankYouFileName)}"
            data-ga4-submit-event="${escapeHtml(offer.submitEvent)}"
            data-ga4-label="${escapeHtml(offer.title)}"
            data-real-delivery-form="consult"
          >
            <label>
              Work email
              <input type="email" name="email" placeholder="you@company.com" required />
            </label>
            <label>
              Team or role
              <input type="text" name="role" placeholder="Growth, product marketing, content ops..." required />
            </label>
            <label>
              Current workflow bottleneck
              <textarea name="workflow_bottleneck" rows="4" placeholder="What is slowing down the first publish-ready output?" required></textarea>
            </label>
            <label>
              Desired outcome in the next 2 weeks
              <textarea name="desired_outcome" rows="4" placeholder="What would count as a good result after the audit?" required></textarea>
            </label>
            <div class="turnstile-shell" data-turnstile-slot></div>
            <p class="form-status" data-form-status hidden></p>
            <button
              type="submit"
              data-ga4-event="${escapeHtml(offer.clickEvent)}"
              data-ga4-label="${escapeHtml(offer.title)}"
            >
              Request audit
            </button>
          </form>
          <ul>
            <li>Best for teams already testing or shipping, not for broad category curiosity.</li>
            <li>Use the download assets first if the team still needs a low-friction first pass.</li>
            <li>Track this separately from downloads because it is a higher-intent commercial action.</li>
          </ul>
        </div>
      </section>

      ${
        relatedPages.length > 0
          ? `<section><h2>Review these first if needed</h2><ul>${relatedPages
              .map(
                (page) =>
                  `<li><a class="text-link" href="${escapeHtml(path.basename(page.path))}">${escapeHtml(page.navLabel ?? page.slug)}</a></li>`,
              )
              .join('')}</ul></section>`
          : ''
      }
    </main>
  </body>
</html>`

  return { html, canonicalUrl }
}

function renderConsultThankYouHtml(site, offer) {
  const canonicalUrl = new URL(offer.thankYouPath, `${config.baseUrl}/`).toString()
  const readyEvents = [
    {
      event: offer.submitEvent,
      label: offer.title,
      params: {
        offer_slug: offer.slug,
        stage: 'submit',
      },
    },
    {
      event: offer.readyEvent,
      label: offer.title,
      params: {
        offer_slug: offer.slug,
        stage: 'ready',
      },
    },
    {
      event: offer.commercialEvent,
      label: offer.title,
      params: {
        offer_slug: offer.slug,
        stage: 'commercial_interest',
      },
    },
  ]
  const ga4Snippet = renderGa4Snippet(
    {
      title: `${offer.title} ready`,
      path: offer.thankYouPath,
      ctaTitle: offer.title,
    },
    { readyEvents },
  )
  const relatedPages = offer.followUpPages
    .map((slug) => site.pages.find((page) => page.slug === slug))
    .filter(Boolean)
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(offer.title)} ready</title>
    <meta name="description" content="${escapeHtml('The audit request is captured. Use the next-step pages while the request is reviewed.')}"/>
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${ga4Snippet}
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #171717; color: #efede7; }
      main { width: min(820px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 48px; }
      section { padding: 22px 0; border-top: 1px solid rgba(255,255,255,0.12); }
      h1, h2, p, ul { margin: 0; }
      h1 { font-size: 2.1rem; line-height: 1.08; margin-bottom: 12px; }
      h2 { font-size: 1.05rem; margin-bottom: 10px; }
      p, li { color: #d3cec3; line-height: 1.7; }
      .eyebrow { color: #8eb777; font-size: 0.82rem; text-transform: uppercase; margin-bottom: 8px; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); padding: 14px; }
      .card strong { display: block; color: #f3f1ea; margin-bottom: 8px; }
      .button {
        display: inline-block;
        margin-top: 14px;
        padding: 12px 16px;
        background: #dcb45c;
        color: #171717;
        text-decoration: none;
        font-weight: 700;
      }
      .text-link { color: #f5e6b0; }
      ul { padding-left: 20px; }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        h1 { font-size: 1.9rem; }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${escapeHtml(site.cluster.label)}</p>
      <h1>Audit request captured</h1>
      <p>Use the strongest workflow or asset page below while the request is reviewed. This path is tracked separately from downloads so the system can compare low-friction lead magnets against higher-intent commercial moves.</p>

      <section>
        <h2>What should happen next</h2>
        <div class="grid">
          <article class="card">
            <strong>Confirm the narrow workflow</strong>
            <p>Make sure the request points to one owner, one workflow bottleneck, and one outcome that matters this cycle.</p>
          </article>
          <article class="card">
            <strong>Pull the best evidence</strong>
            <p>Use the strongest pricing, workflow, and case-study pages to ground the next recommendation.</p>
          </article>
          <article class="card">
            <strong>Choose the next artifact</strong>
            <p>Decide whether the team needs the prompt pack, checklist, worksheet, or a direct commercial follow-up.</p>
          </article>
          <article class="card">
            <strong>Record the commercial signal</strong>
            <p>This action should be treated as higher intent than a regular download when ranking next experiments.</p>
          </article>
        </div>
      </section>

      ${
        relatedPages.length > 0
          ? `<section>
        <h2>Good pages to open next</h2>
        <ul>${relatedPages
          .map(
            (page) =>
              `<li><a class="text-link" href="${escapeHtml(path.basename(page.path))}">${escapeHtml(page.navLabel ?? page.slug)}</a></li>`,
          )
          .join('')}</ul>
      </section>`
          : ''
      }
    </main>
  </body>
</html>`

  return { html, canonicalUrl }
}

function applyNoindexDirective(html) {
  if (html.includes('name="robots"')) return html
  return html.replace(
    '    <link rel="canonical"',
    '    <meta name="robots" content="noindex, nofollow" />\n    <link rel="canonical"',
  )
}

const genericContentPhrases = [
  'this page should',
  'useful page',
  'move from curiosity',
  'next-best decision surface',
  'should help the visitor',
  'should explain',
  'should include',
  'generic category read',
]

const aiFlavorPhrases = [
  'seamless',
  'cutting-edge',
  'best-in-class',
  'streamline',
  'unlock',
  'powerful',
  'robust',
  'comprehensive',
  'revolutionize',
  'maximize',
]

function buildPageAuditSurface(page) {
  return [
    page.title,
    page.metaDescription,
    page.intro,
    ...safeArray(page.originalAnchors),
    ...safeArray(page.verdicts).flatMap((item) => [item.title, item.detail]),
    ...safeArray(page.keyFacts).flatMap((item) => [item.label, item.value]),
    ...safeArray(page.examples).flatMap((item) => [item.title, item.body]),
    ...safeArray(page.sections).flatMap((section) => [
      section.heading,
      ...safeArray(section.paragraphs),
      ...safeArray(section.bullets),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
}

function countGenericPhraseOccurrences(text) {
  return countPhraseMatches(text, genericContentPhrases)
}

function auditPage(renderedPage) {
  const issues = []
  let score = 100
  const contentStats = renderedPage.contentStats ?? {}
  const auditSurface = buildPageAuditSurface(renderedPage)
  const genericPhraseCount = countGenericPhraseOccurrences(auditSurface)
  const aiFlavorPhraseCount = countPhraseMatches(auditSurface, aiFlavorPhrases)

  if (renderedPage.wordCount < 520) {
    issues.push({
      severity: 'high',
      message: `Word count is only ${renderedPage.wordCount}; content needs more decision support and grounded examples.`,
    })
    score -= 18
  }

  if (renderedPage.titleLength < 42 || renderedPage.titleLength > 68) {
    issues.push({
      severity: 'medium',
      message: `Title length is ${renderedPage.titleLength}; aim for 42-68 characters.`,
    })
    score -= 8
  }

  if (renderedPage.descriptionLength < 110 || renderedPage.descriptionLength > 165) {
    issues.push({
      severity: 'medium',
      message: `Meta description length is ${renderedPage.descriptionLength}; keep it tighter.`,
    })
    score -= 8
  }

  if (!renderedPage.html.includes('rel="canonical"')) {
    issues.push({
      severity: 'high',
      message: 'Canonical link is missing.',
    })
    score -= 20
  }

  if (!renderedPage.html.includes('application/ld+json')) {
    issues.push({
      severity: 'medium',
      message: 'Structured data block is missing.',
    })
    score -= 10
  }

  if ((renderedPage.html.match(/<a /g) ?? []).length < 3) {
    issues.push({
      severity: 'medium',
      message: 'Internal link count is low; add more navigation paths.',
    })
    score -= 8
  }

  if ((renderedPage.originalAnchors?.length ?? 0) < 1) {
    issues.push({
      severity: 'high',
      message: 'Original anchor section is missing.',
    })
    score -= 18
  }

  if ((contentStats.factCount ?? 0) < 2) {
    issues.push({
      severity: 'high',
      message: 'Page does not contain enough concrete facts.',
    })
    score -= 16
  }

  if (
    ['hub', 'alternatives', 'best-tools', 'pricing', 'free-vs-paid'].includes(renderedPage.type) &&
    (contentStats.verdictCount ?? 0) < 1
  ) {
    issues.push({
      severity: 'high',
      message: 'Decision-stage page is missing an explicit verdict.',
    })
    score -= 16
  }

  if (
    ['workflow', 'use-cases', 'case-study', 'template-kit'].includes(renderedPage.type) &&
    (contentStats.exampleCount ?? 0) < 1
  ) {
    issues.push({
      severity: 'medium',
      message: 'Implementation page needs a concrete example or scenario.',
    })
    score -= 10
  }

  if ((contentStats.sourceRefCount ?? 0) < 2) {
    issues.push({
      severity: 'high',
      message: 'Page needs more visible source references for traceability.',
    })
    score -= 14
  }

  if ((contentStats.claimCount ?? 0) < 2) {
    issues.push({
      severity: 'medium',
      message: 'Page is not grounded in enough reusable claims; strengthen the upstream claim set before publishing.',
    })
    score -= 10
  }

  if ((contentStats.claimStatementCount ?? 0) < Math.min(contentStats.claimCount ?? 0, 2)) {
    issues.push({
      severity: 'high',
      message: 'Too many upstream claims are empty or unarticulated; keep generated claim text unless the Wiki card improves it.',
    })
    score -= 18
  }

  if (
    ['alternatives', 'pricing', 'free-vs-paid', 'workflow', 'template-kit'].includes(renderedPage.type) &&
    (contentStats.claimEvidenceLineCount ?? 0) < 4
  ) {
    issues.push({
      severity: 'medium',
      message: 'High-value page needs denser claim evidence so the page reads like a researcher already did the comparison work.',
    })
    score -= 10
  }

  if ((contentStats.briefSectionCount ?? 0) < 3) {
    issues.push({
      severity: 'medium',
      message: 'Page brief is too thin; define clearer required sections and visitor questions.',
    })
    score -= 8
  }

  if ((contentStats.briefCompletenessScore ?? 0) < 60) {
    issues.push({
      severity: (contentStats.briefCompletenessScore ?? 0) < 40 ? 'high' : 'medium',
      message: `Page brief completeness is only ${contentStats.briefCompletenessScore ?? 0}; keep page goal, visitor intent, and must-win questions filled so the page stays on-thesis.`,
    })
    score -= (contentStats.briefCompletenessScore ?? 0) < 40 ? 14 : 8
  }

  if ((contentStats.materialSlotCount ?? 0) < 1) {
    issues.push({
      severity: 'medium',
      message: 'Page is missing evidence or media slots that make the content concrete.',
    })
    score -= 8
  }

  if ((contentStats.dossierSignalCount ?? 0) < 2) {
    issues.push({
      severity: 'medium',
      message: 'Research dossier signals are thin; add fresher pricing, changelog, or community evidence.',
    })
    score -= 8
  }

  if ((contentStats.signalRichSourceCount ?? 0) < 2) {
    issues.push({
      severity: 'medium',
      message: 'Source references are present, but too few carry page-specific signal or named evidence.',
    })
    score -= 8
  }

  if ((contentStats.lowSignalSourceCount ?? 0) > 1) {
    issues.push({
      severity: 'medium',
      message: 'Too many source references look low-signal or boilerplate; replace them with fresher operator evidence.',
    })
    score -= 8
  }

  if ((contentStats.specificityScore ?? 0) < 6) {
    issues.push({
      severity: (contentStats.specificityScore ?? 0) < 4 ? 'high' : 'medium',
      message: `Specificity score is ${contentStats.specificityScore ?? 0}; add more named tools, concrete workflow details, or numerical evidence.`,
    })
    score -= (contentStats.specificityScore ?? 0) < 4 ? 14 : 8
  }

  if ((contentStats.repeatedSentenceCount ?? 0) > 1) {
    issues.push({
      severity: 'medium',
      message: `Detected ${contentStats.repeatedSentenceCount} repeated sentence pattern(s); tighten templated copy before publishing.`,
    })
    score -= 8
  }

  if ((contentStats.genericParagraphCount ?? 0) > 2 || genericPhraseCount > 5) {
    issues.push({
      severity: 'medium',
      message: `Page still reads too generically; ${contentStats.genericParagraphCount ?? 0} paragraph(s) rely on generic narration and ${genericPhraseCount} generic phrase hits remain.`,
    })
    score -= 8
  }

  if ((contentStats.aiFlavorParagraphCount ?? 0) > 1 || aiFlavorPhraseCount > 3) {
    issues.push({
      severity: 'medium',
      message: `Detected ${contentStats.aiFlavorParagraphCount ?? 0} AI-flavored paragraph(s); replace promo-style language with concrete evidence or workflow detail.`,
    })
    score -= 8
  }

  if ((contentStats.lowEvidenceParagraphCount ?? 0) > 2) {
    issues.push({
      severity: (contentStats.lowEvidenceParagraphCount ?? 0) > 4 ? 'high' : 'medium',
      message: `Found ${contentStats.lowEvidenceParagraphCount ?? 0} low-evidence paragraph(s); add named tools, numbers, or source-backed workflow details.`,
    })
    score -= (contentStats.lowEvidenceParagraphCount ?? 0) > 4 ? 14 : 8
  }

  if (
    ['use-cases', 'workflow', 'alternatives'].includes(renderedPage.type) &&
    (contentStats.structuredUseCaseCount ?? 0) < 2
  ) {
    issues.push({
      severity: 'high',
      message: 'This page needs more structured use-case coverage with audience, trigger, workflow, and CTA.',
    })
    score -= 16
  }

  if (renderedPage.type === 'alternatives' && (contentStats.decisionPathCount ?? 0) < 2) {
    issues.push({
      severity: 'medium',
      message: 'Alternatives page needs at least two decision paths so different buyer jobs do not collapse into one generic recommendation.',
    })
    score -= 10
  }

  if (
    renderedPage.type === 'workflow' &&
    (contentStats.workflowDetailCount ?? 0) < Math.min(safeArray(renderedPage.stepItems).length, 3)
  ) {
    issues.push({
      severity: 'high',
      message: 'Workflow page is missing enough step-level detail; each step should name input, output, owner, success metric, and failure point.',
    })
    score -= 16
  }

  if (
    renderedPage.type === 'template-kit' &&
    ((contentStats.assetPreviewCount ?? 0) < 2 ||
      (contentStats.deliveryFlowCount ?? 0) < 3 ||
      (contentStats.beforeAfterCount ?? 0) < 2)
  ) {
    issues.push({
      severity: 'high',
      message: 'Template-kit page needs stronger product proof: asset preview, before/after framing, and a complete delivery flow.',
    })
    score -= 18
  }

  if (
    ['alternatives', 'pricing', 'free-vs-paid', 'workflow', 'template-kit'].includes(renderedPage.type) &&
    ((contentStats.evidenceCardCount ?? 0) < 3 || (contentStats.commercialModuleCount ?? 0) < 1)
  ) {
    issues.push({
      severity: 'high',
      message: 'High-value page needs stronger research proof and a clearer action block: keep at least three evidence cards and one commercial module.',
    })
    score -= 18
  }

  return {
    status: issues.some((issue) => issue.severity === 'high')
      ? 'attention'
      : issues.length > 0
        ? 'warning'
        : 'pass',
    score: clamp(score, 52, 100),
    issues,
  }
}

function buildSiteSummary(cluster, renderedPages) {
  const auditResults = renderedPages.map((page) => ({
    pageSlug: page.slug,
    path: page.path,
    ...auditPage(page),
  }))
  const auditScore = round(
    auditResults.reduce((sum, item) => sum + item.score, 0) / auditResults.length,
  )
  const antiGeneric = {
    genericPhraseHits: renderedPages.reduce(
      (sum, page) => sum + (page.contentStats?.genericPhraseCount ?? 0),
      0,
    ),
    genericParagraphs: renderedPages.reduce(
      (sum, page) => sum + (page.contentStats?.genericParagraphCount ?? 0),
      0,
    ),
    aiFlavorParagraphs: renderedPages.reduce(
      (sum, page) => sum + (page.contentStats?.aiFlavorParagraphCount ?? 0),
      0,
    ),
    lowEvidenceParagraphs: renderedPages.reduce(
      (sum, page) => sum + (page.contentStats?.lowEvidenceParagraphCount ?? 0),
      0,
    ),
    structuredUseCasePages: renderedPages.filter(
      (page) => (page.contentStats?.structuredUseCaseCount ?? 0) >= 2,
    ).length,
    proofRichPages: renderedPages.filter(
      (page) => (page.contentStats?.proofModuleCount ?? 0) >= 2,
    ).length,
  }

  return {
    cluster,
    auditScore,
    auditStatus:
      auditResults.some((item) => item.status === 'attention')
        ? 'attention'
        : auditResults.some((item) => item.status === 'warning')
          ? 'warning'
          : 'pass',
    auditIssues: auditResults.flatMap((item) =>
      item.issues.map((issue) => ({
        pageSlug: item.pageSlug,
        path: item.path,
        ...issue,
      })),
    ),
    antiGeneric,
  }
}

function evaluatePublishGate(site) {
  const rules = experiment.gateRules.publishGate
  const sourceSignals = {
    outdatedSerpResults: site.research.gapSummary.outdatedResultCount,
    forumPainThreads: site.research.gapSummary.communityPainCount,
  }

  const coveredIntents = dedupe(site.pages.flatMap((page) => page.coveredIntents ?? []))
  const searchIntentCoverage = site.research.topIntents.filter((intent) =>
    coveredIntents.includes(intent),
  ).length
  const faqRealQueryCoverage = site.research.faqCandidates.length
  const uniqueAssetCount = site.research.gapSummary.gapOpportunities.length
  const originalAnchorCount = dedupe(
    site.pages.flatMap((page) => page.originalAnchors ?? []),
  ).length
  const artifactPages = site.pageArtifacts ?? []
  const avgFactCount = round(
    artifactPages.reduce((sum, page) => sum + (page.contentStats?.factCount ?? 0), 0) /
      Math.max(artifactPages.length, 1),
    1,
  )
  const avgSpecificityScore = round(
    artifactPages.reduce((sum, page) => sum + (page.contentStats?.specificityScore ?? 0), 0) /
      Math.max(artifactPages.length, 1),
    1,
  )
  const verdictPages = artifactPages.filter((page) => (page.contentStats?.verdictCount ?? 0) > 0).length
  const examplePages = artifactPages.filter((page) => (page.contentStats?.exampleCount ?? 0) > 0).length
  const traceablePages = artifactPages.filter((page) => (page.contentStats?.sourceRefCount ?? 0) >= 2).length
  const claimRichPages = artifactPages.filter((page) => (page.contentStats?.claimCount ?? 0) >= 3).length
  const dossierReadyPages = artifactPages.filter((page) => (page.contentStats?.dossierSignalCount ?? 0) >= 2).length
  const specificPages = artifactPages.filter((page) => (page.contentStats?.specificityScore ?? 0) >= 6).length
  const signalRichPages = artifactPages.filter(
    (page) => (page.contentStats?.signalRichSourceCount ?? 0) >= 2,
  ).length
  const lowSignalHeavyPages = artifactPages.filter(
    (page) => (page.contentStats?.lowSignalSourceCount ?? 0) > 1,
  ).length
  const repetitionSafePages = artifactPages.filter(
    (page) => (page.contentStats?.repeatedSentenceCount ?? 0) <= 1,
  ).length
  const genericPhrasePages = artifactPages.filter(
    (page) =>
      (page.contentStats?.genericParagraphCount ?? 0) > 2 ||
      (page.contentStats?.genericPhraseCount ?? 0) > 5,
  ).length
  const aiFlavorPages = artifactPages.filter(
    (page) =>
      (page.contentStats?.aiFlavorParagraphCount ?? 0) > 1 ||
      (page.contentStats?.aiFlavorPhraseCount ?? 0) > 3,
  ).length
  const lowEvidencePages = artifactPages.filter(
    (page) => (page.contentStats?.lowEvidenceParagraphCount ?? 0) > 2,
  ).length
  const structuredUseCasePages = artifactPages.filter(
    (page) =>
      !['alternatives', 'workflow', 'use-cases'].includes(page.type) ||
      (page.contentStats?.structuredUseCaseCount ?? 0) >= 2,
  ).length
  const proofRichPages = artifactPages.filter(
    (page) =>
      !['template-kit', 'case-study', 'workflow'].includes(page.type) ||
      (page.contentStats?.proofModuleCount ?? 0) >= 2,
  ).length
  const aiFluffRatio = round(
    clamp(
      (
        artifactPages.filter((page) => (page.contentStats?.specificityScore ?? 0) < 6).length +
        artifactPages.filter((page) => (page.contentStats?.repeatedSentenceCount ?? 0) > 1).length +
        lowSignalHeavyPages +
        genericPhrasePages +
        aiFlavorPages +
        lowEvidencePages
      ) / Math.max(artifactPages.length * 6, 1),
      0,
      1,
    ),
    2,
  )
  const spotCheckPages = artifactPages.filter((page) => page.reviewSignals?.needsSpotCheck).length

  const informationGapPass =
    sourceSignals.outdatedSerpResults >= rules.outdatedSerpResults ||
    sourceSignals.forumPainThreads >= rules.forumPainThreads ||
    uniqueAssetCount >= rules.uniqueAssetCount

  const completenessPass =
    searchIntentCoverage >= rules.searchIntentCoverage &&
    faqRealQueryCoverage >= rules.faqRealQueryCoverage

  const nonTemplatePass =
    originalAnchorCount >= rules.originalAnchorCount &&
    aiFluffRatio <= rules.maxAiFluffRatio

  const evidenceQualityPass =
    avgFactCount >= 2 &&
    verdictPages >= 2 &&
    examplePages >= 2 &&
    traceablePages >= Math.max(artifactPages.length - 1, 1) &&
    claimRichPages >= Math.max(artifactPages.length - 2, 1) &&
    dossierReadyPages >= Math.max(artifactPages.length - 2, 1) &&
    specificPages >= Math.max(artifactPages.length - 2, 1) &&
    signalRichPages >= Math.max(artifactPages.length - 2, 1) &&
    repetitionSafePages >= Math.max(artifactPages.length - 1, 1) &&
    lowSignalHeavyPages <= 1 &&
    structuredUseCasePages >= Math.max(artifactPages.length - 2, 1) &&
    proofRichPages >= Math.max(artifactPages.length - 2, 1)

  const reviewPass =
    contentConfig.reviewMode === 'unattended' ||
    contentConfig.reviewMode === 'auto' ||
    spotCheckPages === 0

  const status =
    informationGapPass &&
    completenessPass &&
    nonTemplatePass &&
    evidenceQualityPass &&
    reviewPass &&
    site.audit.status !== 'attention'
      ? 'pass'
      : informationGapPass || completenessPass || evidenceQualityPass
        ? 'needs_review'
        : 'fail'

  return {
    status,
    informationGapPass,
    completenessPass,
    nonTemplatePass,
    evidenceQualityPass,
    reviewPass,
    evidence: {
      outdatedSerpResults: sourceSignals.outdatedSerpResults,
      forumPainThreads: sourceSignals.forumPainThreads,
      uniqueAssetCount,
      searchIntentCoverage,
      faqRealQueryCoverage,
      originalAnchorCount,
      aiFluffRatio,
      averageFactCount: avgFactCount,
      averageSpecificityScore: avgSpecificityScore,
      verdictPages,
      examplePages,
      traceablePages,
      claimRichPages,
      dossierReadyPages,
      specificPages,
      signalRichPages,
      lowSignalHeavyPages,
      repetitionSafePages,
      genericPhrasePages,
      aiFlavorPages,
      lowEvidencePages,
      structuredUseCasePages,
      proofRichPages,
      spotCheckPages,
      gapOpportunities: site.research.gapSummary.gapOpportunities,
      topIntents: site.research.topIntents,
    },
  }
}

function buildDeploymentSite(site, auditStatus, publishGate) {
  const releaseMode = publishGate.status === 'pass' ? 'release-ready' : 'preview-only'
  const productionBlocked = publishGate.status !== 'pass'
  const providers = [
    {
      key: 'local-preview',
      label: 'Local preview',
      status: 'live',
      url: new URL(site.homePath, `${config.baseUrl}/`).toString(),
      note:
        releaseMode === 'release-ready'
          ? 'Served through the Vite app for review and QA.'
          : 'Served through the Vite app for review and QA while Gate 2 keeps this site in preview-only mode.',
    },
    {
      key: 'filesystem-export',
      label: 'Filesystem export',
      status: 'ready',
      url: site.outputDir,
      note:
        releaseMode === 'release-ready'
          ? 'Static files are ready for any file-based deploy target.'
          : 'Static files are ready for preview, but production release is blocked until Gate 2 passes.',
    },
    {
      key: 'vercel',
      label: 'Vercel',
      status:
        productionBlocked
          ? 'blocked_gate2'
          : process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID
          ? 'configured'
          : 'needs_credentials',
      note:
        productionBlocked
          ? `Gate 2 is ${publishGate.status}; keep this site in preview-only mode until the publish gate clears.`
          : process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID
          ? 'Environment variables detected for Vercel.'
          : 'Set VERCEL_TOKEN and VERCEL_PROJECT_ID to automate production deploys.',
    },
    {
      key: 'cloudflare-pages',
      label: 'Cloudflare Pages',
      status:
        productionBlocked
          ? 'blocked_gate2'
          : process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
          ? 'configured'
          : 'needs_credentials',
      note:
        productionBlocked
          ? `Gate 2 is ${publishGate.status}; keep this site in preview-only mode until the publish gate clears.`
          : process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
          ? 'Environment variables detected for Cloudflare Pages.'
          : 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to automate Pages deploys.',
    },
    {
      key: 'automiora-release',
      label: 'Automiora release adapter',
      status: productionBlocked
        ? 'blocked_gate2'
        : config.autoReleaseEnabled && config.autoReleaseOnGatePass
          ? 'configured'
          : 'manual-trigger',
      note: productionBlocked
        ? `Gate 2 is ${publishGate.status}; keep this site in preview-only mode until the publish gate clears.`
        : config.autoReleaseEnabled && config.autoReleaseOnGatePass
          ? 'Pipeline can trigger release:prod automatically after Gate 2 passes.'
          : 'Use pnpm run release:prod or enable AUTO_RELEASE_ENABLED + AUTO_RELEASE_ON_GATE_PASS.',
    },
  ]

  return {
    siteSlug: site.siteSlug,
    previewUrl: new URL(site.homePath, `${config.baseUrl}/`).toString(),
    auditStatus,
    releaseMode,
    publishGateStatus: publishGate.status,
    bundlePath: site.outputDir,
    providers,
  }
}

function isLocalBaseUrl(url) {
  try {
    const parsed = new URL(url)
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)
  } catch {
    return true
  }
}

async function maybeRunAutoRelease(site) {
  if (!config.autoReleaseEnabled || !config.autoReleaseOnGatePass) {
    return {
      status: 'disabled',
      reason: 'AUTO_RELEASE_ENABLED or AUTO_RELEASE_ON_GATE_PASS is false.',
    }
  }

  if (!site) {
    return {
      status: 'skipped',
      reason: 'No release-ready site is available for auto release.',
    }
  }

  if (isLocalBaseUrl(config.baseUrl)) {
    return {
      status: 'skipped',
      reason: 'SITE_BASE_URL is local, so production release was not triggered.',
    }
  }

  const assetSlug = site.conversionAssets?.[0]?.slug ?? process.env.RELEASE_ASSET_SLUG ?? 'prompt-pack'
  const commandArgs = [
    'run',
    'release:prod',
    '--',
    '--skip-lint',
    '--skip-pipeline',
    '--site-slug',
    site.siteSlug,
    '--asset-slug',
    assetSlug,
    '--site-base-url',
    config.baseUrl,
  ]

  try {
    const { stdout, stderr } = await execFileAsync('pnpm', commandArgs, {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    })

    return {
      status: 'triggered',
      siteSlug: site.siteSlug,
      assetSlug,
      command: `pnpm ${commandArgs.join(' ')}`,
      outputTail: [...stdout.trim().split('\n').slice(-8), ...stderr.trim().split('\n').slice(-4)]
        .filter(Boolean)
        .slice(-10),
    }
  } catch (error) {
    return {
      status: 'failed',
      siteSlug: site.siteSlug,
      assetSlug,
      command: `pnpm ${commandArgs.join(' ')}`,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function buildSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeHtml(url)}</loc>
    <lastmod>${config.generatedAt}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>
`
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${new URL('/sitemap.xml', `${config.baseUrl}/`).toString()}
`
}

function buildLlmsTxt(sites) {
  const lines = [
    '# Trend Site Pipeline',
    '',
    'This project generates compact decision pages from validated trend clusters.',
    '',
    ...sites.map(
      (site) => `- ${site.siteName}: ${new URL(site.homePath, `${config.baseUrl}/`).toString()}`,
    ),
  ]

  return `${lines.join('\n')}\n`
}

function buildSiteIndexHtml(sites) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Sites</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #171717; color: #f2eee6; }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
      h1, h2, p { margin: 0; }
      section { padding: 20px 0; border-top: 1px solid rgba(255,255,255,0.1); }
      a { color: #b7d7a8; text-decoration: none; }
      ul { padding-left: 20px; }
      li + li { margin-top: 10px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Generated sites</h1>
      <p>Local deployment output for the latest pipeline run.</p>
      <section>
        <ul>
          ${sites
            .map(
              (site) => `<li><a href="./${escapeHtml(site.siteSlug)}/index.html">${escapeHtml(site.siteName)}</a> - ${escapeHtml(site.cluster.label)}</li>`,
            )
            .join('')}
        </ul>
      </section>
    </main>
  </body>
</html>
`
}

function buildRootIndexHtml(primarySite) {
  if (!primarySite) {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Trend Site Pipeline</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #171717; color: #f2eee6; }
      main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
      a { color: #b7d7a8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Trend Site Pipeline</h1>
      <p>No release-ready site is available yet.</p>
      <p><a href="/generated-sites/index.html">Browse generated sites</a></p>
    </main>
  </body>
</html>
`
  }

  const targetUrl = new URL(primarySite.homePath, `${config.baseUrl}/`).toString()
  const targetPath = primarySite.homePath

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(targetPath)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(primarySite.siteName)}</title>
    <link rel="canonical" href="${escapeHtml(targetUrl)}" />
    <script>window.location.replace(${JSON.stringify(targetPath)})</script>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #171717; color: #f2eee6; }
      main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
      a { color: #b7d7a8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Redirecting...</h1>
      <p><a href="${escapeHtml(targetPath)}">Open the release-ready site</a></p>
    </main>
  </body>
</html>
`
}

function buildSeoReport(sites, publishGateBySiteSlug) {
  const releasableSites = sites.filter(
    (site) => publishGateBySiteSlug.get(site.siteSlug)?.status === 'pass',
  )
  const blockedSites = sites.filter(
    (site) => publishGateBySiteSlug.get(site.siteSlug)?.status !== 'pass',
  )
  const urls = releasableSites.flatMap((site) => site.pages.map((page) => page.canonicalUrl))
  const blockedUrls = blockedSites.flatMap((site) => site.pages.map((page) => page.canonicalUrl))
  const localBase = isLocalBaseUrl(config.baseUrl)
  const hasSubmissionQueue = urls.length > 0
  const googleSubmitReady = Boolean(googleConfig.gscSiteUrl) && hasAnyGoogleAuth()
  const googleStatus = !hasSubmissionQueue
    ? 'blocked_gate2'
    : localBase
      ? 'prepared'
      : googleSubmitReady
        ? 'configured'
        : 'needs_credentials'
  const indexNowReady =
    hasSubmissionQueue && !localBase && process.env.INDEXNOW_KEY && process.env.INDEXNOW_HOST

  return {
    baseUrl: config.baseUrl,
    sitemapUrl: new URL('/sitemap.xml', `${config.baseUrl}/`).toString(),
    robotsUrl: new URL('/robots.txt', `${config.baseUrl}/`).toString(),
    llmsUrl: new URL('/llms.txt', `${config.baseUrl}/`).toString(),
    queuedUrls: urls,
    blockedUrls,
    queuedSiteSlugs: releasableSites.map((site) => site.siteSlug),
    blockedSiteSlugs: blockedSites.map((site) => site.siteSlug),
    engines: [
      {
        key: 'google-search-console',
        label: 'Google Search Console',
        status: googleStatus,
        note: !hasSubmissionQueue
          ? 'No URLs are eligible for submission because every site is still blocked by Gate 2.'
          : localBase
          ? 'Local preview URL detected; queue prepared but not submitted.'
          : googleSubmitReady
            ? 'Google Search Console sitemap submission is configured.'
            : 'Set GSC_SITE_URL and Google credentials to automate sitemap submission.',
      },
      {
        key: 'bing-webmaster-tools',
        label: 'Bing Webmaster Tools',
        status: !hasSubmissionQueue ? 'blocked_gate2' : localBase ? 'prepared' : 'manual-step',
        note: !hasSubmissionQueue
          ? 'No sitemap URLs are eligible for Bing submission because Gate 2 blocked release.'
          : localBase
          ? 'Local preview URL detected; sitemap asset is ready.'
          : 'Submit sitemap through Bing Webmaster Tools or IndexNow.',
      },
      {
        key: 'indexnow',
        label: 'IndexNow',
        status: !hasSubmissionQueue
          ? 'blocked_gate2'
          : localBase
            ? 'prepared'
            : indexNowReady
              ? 'configured'
              : 'needs_key',
        note: !hasSubmissionQueue
          ? 'IndexNow notifications are paused because Gate 2 has not cleared.'
          : localBase
          ? 'IndexNow payload prepared but not sent from a local hostname.'
          : indexNowReady
            ? 'Environment variables detected for IndexNow submission.'
            : 'Set INDEXNOW_KEY and INDEXNOW_HOST to send live notifications.',
      },
    ],
  }
}

function buildSeoQueues(sites, seoReport) {
  const ctrOptimizationQueue = []
  const visibilityQueue = []
  const entryPageDiagnostics = []

  for (const site of sites) {
    const keyEntryPages = safeArray(site.pageArtifacts).filter((page) =>
      ['index', 'workflow', 'pricing', 'free-vs-paid', 'template-kit'].includes(page.slug),
    )

    if (
      site.gates?.expansion?.day14?.status === 'optimize_snippet' ||
      site.gates?.expansion?.day30?.status === 'optimize'
    ) {
      ctrOptimizationQueue.push({
        siteSlug: site.siteSlug,
        reason:
          site.gates.expansion.day30.status === 'optimize'
            ? site.gates.expansion.day30.reason
            : site.gates.expansion.day14.reason,
        nextAction: site.gates.expansion.day30.nextAction,
        pages: keyEntryPages.map((page) => ({
          pageSlug: page.slug,
          path: page.path,
          titleLength: page.titleLength,
          descriptionLength: page.descriptionLength,
          visualHookNote: `Test a stronger proof-led first screen on ${page.slug}.`,
        })),
      })
    }

    if (
      site.gates?.expansion?.day14?.status === 'fix_indexing' ||
      (site.monitoring?.impressions ?? 0) < 100
    ) {
      visibilityQueue.push({
        siteSlug: site.siteSlug,
        reason:
          site.gates?.expansion?.day14?.status === 'fix_indexing'
            ? site.gates.expansion.day14.reason
            : 'Search visibility is still too weak to support expansion.',
        nextAction:
          site.gates?.expansion?.day14?.status === 'fix_indexing'
            ? site.gates.expansion.day14.nextAction
            : 'Check indexable pages, internal links, and sitemap coverage before creating more pages.',
        pages: keyEntryPages.map((page) => ({
          pageSlug: page.slug,
          path: page.path,
          internalLinkCount: page.internalLinks?.length ?? 0,
          indexingDirective:
            site.pages.find((candidate) => candidate.slug === page.slug)?.indexingDirective ?? 'index',
        })),
      })
    }

    entryPageDiagnostics.push({
      siteSlug: site.siteSlug,
      robotsUrl: seoReport.robotsUrl,
      sitemapUrl: seoReport.sitemapUrl,
      canonicalCoverage: safeArray(site.pageArtifacts).every((page) => Boolean(page.canonicalUrl)),
      indexablePageSet: safeArray(site.pages)
        .filter((page) => page.indexingDirective !== 'noindex')
        .map((page) => page.slug),
      averageInternalLinks: round(
        safeArray(site.pages).reduce((sum, page) => sum + (page.internalLinkCount ?? 0), 0) /
          Math.max(safeArray(site.pages).length, 1),
        1,
      ),
      keyEntryPages: keyEntryPages.map((page) => page.slug),
    })
  }

  return {
    generatedAt: config.generatedAt,
    ctrOptimizationQueue,
    visibilityQueue,
    entryPageDiagnostics,
  }
}

const pageRefreshPresets = {
  workflow: {
    refreshTargets: ['step explanation', 'failure points', 'asset preview', 'example scenario'],
    evidenceInputs: ['workflow refs', 'community pain signals', 'accepted asset handoff notes'],
    nextRewriteGoal: 'Make the first measurable pilot easier to run and harder to misunderstand.',
  },
  pricing: {
    refreshTargets: ['visible price anchor', 'hidden cost', 'upgrade trigger', 'business-proof sentence'],
    evidenceInputs: ['pricing anchors', 'ROI claims', 'community complaints about cost or limits'],
    nextRewriteGoal: 'Keep the commercial comparison grounded in public anchors, hidden cost, and a believable upgrade trigger.',
  },
  'free-vs-paid': {
    refreshTargets: ['free-path limit', 'paid unlock', 'upgrade trigger', 'proof sentence'],
    evidenceInputs: ['pricing anchors', 'workflow scale signals', 'buyer ROI language'],
    nextRewriteGoal: 'Explain when free still works and when the workflow cost makes paid rational.',
  },
  'case-study': {
    refreshTargets: ['before state', 'intervention detail', 'what changed in review', 'reusable artifact created'],
    evidenceInputs: ['workflow pilot notes', 'review failure points', 'asset handoff details'],
    nextRewriteGoal: 'Make the page read like a believable operating record rather than a summary.',
  },
  'template-kit': {
    refreshTargets: ['asset ordering logic', 'kit selection path', 'internal links to asset pages', 'repeat-run value'],
    evidenceInputs: ['asset acceptance notes', 'use-case mapping', 'delivery flow evidence'],
    nextRewriteGoal: 'Turn the kit into a product page that helps the visitor choose the right asset fast.',
  },
}

function buildPageRefreshPlans(sites, seoQueues) {
  const ctrQueueBySite = new Map(
    safeArray(seoQueues?.ctrOptimizationQueue).map((entry) => [
      entry.siteSlug,
      new Set(safeArray(entry.pages).map((page) => page.pageSlug)),
    ]),
  )
  const visibilityQueueBySite = new Map(
    safeArray(seoQueues?.visibilityQueue).map((entry) => [
      entry.siteSlug,
      new Set(safeArray(entry.pages).map((page) => page.pageSlug)),
    ]),
  )

  return sites.flatMap((site) => {
    const ctrPages = ctrQueueBySite.get(site.siteSlug) ?? new Set()
    const visibilityPages = visibilityQueueBySite.get(site.siteSlug) ?? new Set()

    return safeArray(site.pageArtifacts)
      .filter((page) => Boolean(pageRefreshPresets[page.slug]))
      .map((page) => {
        const preset = pageRefreshPresets[page.slug]
        const brief = safeArray(site.pageBriefs).find((item) => item.pageType === page.type)
        const linkedAssetSlug = page.assetBinding?.primary?.slug ?? site.conversionAssets[0]?.slug ?? ''
        const linkedClaimIds = dedupe([
          ...safeArray(brief?.primaryClaimIds).slice(0, 2),
          ...safeArray(brief?.secondaryClaimIds).slice(0, 1),
        ])
        const refreshTriggers = []

        if (ctrPages.has(page.slug)) {
          refreshTriggers.push('This page is already in the CTR optimization queue.')
        }
        if (visibilityPages.has(page.slug)) {
          refreshTriggers.push('This page is already in the visibility / indexing queue.')
        }
        if ((page.contentStats?.lowEvidenceParagraphCount ?? 0) > 0) {
          refreshTriggers.push(
            `${page.contentStats?.lowEvidenceParagraphCount ?? 0} low-evidence paragraph(s) should be replaced with stronger proof.`,
          )
        }
        if ((page.contentStats?.genericParagraphCount ?? 0) > 0) {
          refreshTriggers.push(
            `${page.contentStats?.genericParagraphCount ?? 0} generic paragraph(s) should be rewritten into more specific operator language.`,
          )
        }
        if (safeArray(site.audit?.issues).length > 0) {
          refreshTriggers.push('The site audit still has open issues, so this page should absorb the strongest supporting evidence next.')
        }
        if (refreshTriggers.length === 0) {
          refreshTriggers.push('Refresh when new source-pack evidence, asset acceptance, or search feedback changes this page’s core claim.')
        }

        const writebackTargets = dedupe([
          brief?.id ? `page_brief:${brief.id}` : '',
          linkedAssetSlug ? `conversion_asset:${linkedAssetSlug}` : '',
          ...linkedClaimIds.map((claimId) => `claim:${claimId}`),
        ]).filter(Boolean)

        return {
          siteSlug: site.siteSlug,
          pageSlug: page.slug,
          pageType: page.type,
          priority:
            ctrPages.has(page.slug) || visibilityPages.has(page.slug) || page.type === 'template-kit'
              ? 'high'
              : 'medium',
          refreshTargets: preset.refreshTargets,
          evidenceInputs: preset.evidenceInputs,
          refreshTriggers,
          nextRewriteGoal: preset.nextRewriteGoal,
          writebackTargets,
          pageBriefId: brief?.id ?? '',
          linkedClaimIds,
          linkedAssetSlug,
        }
      })
  })
}

function buildSourceRefreshQueue(sites) {
  return sites
    .map((site) => {
      const refreshTargets = Object.entries(site.sourcePack.categories)
        .flatMap(([category, items]) =>
          safeArray(items).map((item) => ({
            category,
            title: item.title,
            url: item.url,
            domain: item.domain,
            sourceSubtype: item.sourceSubtype ?? category,
            freshnessScore: item.freshnessScore ?? 0,
            sourceQualityScore: item.sourceQualityScore ?? 0,
            reason:
              (item.freshnessScore ?? 0) < 0.55
                ? 'freshness is weak'
                : !item.firecrawl && ['official', 'competitive', 'product', 'workflow'].includes(category)
                  ? 'missing scrape-backed enrichment'
                  : 'quality should be revalidated',
          })),
        )
        .filter(
          (item) =>
            item.url &&
            (
              item.freshnessScore < 0.55 ||
              item.sourceQualityScore < 0.58 ||
              (
                ['official', 'competitive', 'product', 'workflow'].includes(item.category) &&
                item.reason === 'missing scrape-backed enrichment'
              )
            ),
        )
        .toSorted((left, right) => {
          const leftScore = left.freshnessScore + left.sourceQualityScore
          const rightScore = right.freshnessScore + right.sourceQualityScore
          return leftScore - rightScore
        })
        .slice(0, 8)

      return {
        siteSlug: site.siteSlug,
        keyword: site.cluster.primaryKeyword,
        refreshTargets,
      }
    })
    .filter((entry) => entry.refreshTargets.length > 0)
}

function buildSourceRefreshQueueMarkdown(entries) {
  const lines = [
    '# Source Refresh Queue',
    '',
  ]

  if (entries.length === 0) {
    lines.push('- No source refresh targets were flagged in this run.')
    return `${lines.join('\n')}\n`
  }

  for (const entry of entries) {
    lines.push(`## ${entry.siteSlug}`)
    lines.push(`- Keyword: ${entry.keyword}`)
    for (const item of entry.refreshTargets) {
      lines.push(
        `- [${item.category}] ${item.title} | freshness ${item.freshnessScore} | quality ${item.sourceQualityScore} | ${item.reason}`,
      )
      lines.push(`  - ${item.url}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function buildPageRefreshPlansMarkdown(entries) {
  if (entries.length === 0) {
    return '# Page Refresh Plans\n\nNo page refresh plans generated.\n'
  }

  return [
    '# Page Refresh Plans',
    '',
    ...entries.flatMap((entry) => [
      `## ${entry.siteSlug} / ${entry.pageSlug}`,
      '',
      `- priority: ${entry.priority}`,
      `- next rewrite goal: ${entry.nextRewriteGoal}`,
      `- writeback targets: ${entry.writebackTargets.join(', ') || 'none'}`,
      '',
      '### Refresh targets',
      ...formatMarkdownBullets(entry.refreshTargets),
      '',
      '### Evidence inputs',
      ...formatMarkdownBullets(entry.evidenceInputs),
      '',
      '### Refresh triggers',
      ...formatMarkdownBullets(entry.refreshTriggers),
      '',
    ]),
  ].join('\n')
}

function buildCommercialIntentModel(sites) {
  return {
    generatedAt: config.generatedAt,
    sites: sites.map((site) => {
      const lowFrictionActions = safeArray(site.conversionAssets).map((asset) => ({
        actionType: 'lead_magnet_download',
        assetSlug: asset.slug,
        assetTitle: asset.title,
        clickEvent: asset.clickEvent,
        submitEvent: asset.formEvent,
        deliveryEvent: asset.deliveryEvent,
        intentTier: 'low_friction',
        primaryPages: asset.primaryPages,
      }))

      const highIntentActions = dedupeBy(
        safeArray(site.pageArtifacts).flatMap((page) =>
          safeArray(page.commercialModules).flatMap((module) =>
            safeArray(module.items).map((item) => ({
              key: `${page.slug}:${item.event}:${item.label}`,
              pageSlug: page.slug,
              moduleType: module.type,
              actionType: item.actionTier ?? item.event,
              label: item.label,
              event: item.event,
              url: item.url,
              intentTier: item.event === 'consult_click' ? 'high_intent' : 'commercial_clickout',
            })),
          ),
        ),
        'key',
      ).map(({ key, ...item }) => item)

      return {
        siteSlug: site.siteSlug,
        lowFrictionActions,
        highIntentActions,
        summary:
          `Low-friction actions: ${lowFrictionActions.length}. ` +
          `Higher-intent actions: ${highIntentActions.length}.`,
      }
    }),
  }
}

function buildAssetPerformanceView(sites, commercialOpsSnapshot = null) {
  const liveAssetMap = new Map(
    safeArray(commercialOpsSnapshot?.assetPerformance).map((entry) => [
      `${entry.siteSlug}/${entry.assetSlug}`,
      entry,
    ]),
  )
  const entries = sites.flatMap((site) =>
    safeArray(site.conversionAssets).map((asset) => {
      const linkedPages = safeArray(site.pageArtifacts).filter(
        (page) => page.assetBinding?.primary?.slug === asset.slug,
      )
      const pathRows = linkedPages.map((page) => {
        const baseSubmit =
          page.type === 'template-kit'
            ? 0.26
            : ['pricing', 'free-vs-paid', 'best-tools', 'alternatives'].includes(page.type)
              ? 0.21
              : page.type === 'workflow'
                ? 0.18
                : 0.15
        const modeledSubmitRate = clamp(
          round(baseSubmit + (asset.acceptance?.totalScore ?? 70) / 1000, 3),
          0.08,
          0.38,
        )
        const modeledDeliveryRate = clamp(
          round(modeledSubmitRate * (asset.acceptance?.gateStatus === 'pass' ? 0.84 : 0.66), 3),
          0.05,
          0.32,
        )
        const modeledDeeperActionRate = clamp(
          round(
            modeledDeliveryRate *
              (['workflow', 'case-study', 'template-kit'].includes(page.type) ? 0.42 : 0.28),
            3,
          ),
          0.02,
          0.16,
        )

        return {
          pageSlug: page.slug,
          pageType: page.type,
          path: `${page.slug} -> ${asset.slug}`,
          modeledSubmitRate,
          modeledDeliveryRate,
          modeledDeeperActionRate,
        }
      })

      const bestPath =
        pathRows.sort((left, right) => right.modeledDeeperActionRate - left.modeledDeeperActionRate)[0] ??
        null
      const liveRow = liveAssetMap.get(`${site.siteSlug}/${asset.slug}`)
      const hasLiveOpsSignal =
        Boolean(liveRow) &&
        (
          preferFiniteNumber(liveRow?.leadCount) > 0 ||
          preferFiniteNumber(liveRow?.deliveredCount) > 0 ||
          preferFiniteNumber(liveRow?.qualifiedEvents) > 0 ||
          preferFiniteNumber(liveRow?.wonEvents) > 0 ||
          preferFiniteNumber(liveRow?.revenueUsd) > 0
        )

      if (hasLiveOpsSignal) {
        const leadCount = Math.max(preferFiniteNumber(liveRow?.leadCount), 1)
        const submitRate = clamp(
          round(
            preferFiniteNumber(liveRow?.deliveredCount) > 0
              ? preferFiniteNumber(liveRow?.deliveredCount) / leadCount
              : Math.min(preferFiniteNumber(liveRow?.leadCount) / 10, 0.32),
            3,
          ),
          0.03,
          0.95,
        )
        const deliveryRate = clamp(
          round(preferFiniteNumber(liveRow?.deliveredCount) / leadCount, 3),
          0,
          0.95,
        )
        const deeperActionRate = clamp(
          round(
            (
              preferFiniteNumber(liveRow?.qualifiedEvents) +
              preferFiniteNumber(liveRow?.wonEvents) +
              (preferFiniteNumber(liveRow?.revenueUsd) > 0 ? 1 : 0)
            ) / leadCount,
            3,
          ),
          0,
          0.9,
        )

        return {
          siteSlug: site.siteSlug,
          assetSlug: asset.slug,
          assetTitle: asset.title,
          measurementMode: 'live_ops',
          strongestPath:
            preferMeaningfulText(liveRow?.strongestSourcePage, bestPath?.pageSlug) || `${asset.primaryPages[0] ?? 'index'} -> ${asset.slug}`,
          modeledSubmitRate: submitRate,
          modeledDeliveryRate: deliveryRate,
          modeledDeeperActionRate: deeperActionRate,
          pagePaths: pathRows,
          liveLeadCount: preferFiniteNumber(liveRow?.leadCount),
          liveDeliveredCount: preferFiniteNumber(liveRow?.deliveredCount),
          liveQualifiedEvents: preferFiniteNumber(liveRow?.qualifiedEvents),
          liveWonEvents: preferFiniteNumber(liveRow?.wonEvents),
          liveRevenueUsd: preferFiniteNumber(liveRow?.revenueUsd),
          note:
            `Live ops data: ${preferFiniteNumber(liveRow?.leadCount)} lead(s), ` +
            `${preferFiniteNumber(liveRow?.deliveredCount)} delivered, ` +
            `${preferFiniteNumber(liveRow?.qualifiedEvents)} qualified, ` +
            `${preferFiniteNumber(liveRow?.wonEvents)} won, $${round(preferFiniteNumber(liveRow?.revenueUsd), 2)} revenue.`,
        }
      }

      return {
        siteSlug: site.siteSlug,
        assetSlug: asset.slug,
        assetTitle: asset.title,
        measurementMode: site.monitoring?.conversionSource === 'ga4' ? 'proxy_on_live_sessions' : 'proxy_model',
        strongestPath: bestPath?.path ?? `${asset.primaryPages[0] ?? 'index'} -> ${asset.slug}`,
        modeledSubmitRate: bestPath?.modeledSubmitRate ?? 0,
        modeledDeliveryRate: bestPath?.modeledDeliveryRate ?? 0,
        modeledDeeperActionRate: bestPath?.modeledDeeperActionRate ?? 0,
        pagePaths: pathRows,
        note:
          'These rates are modeled from page intent, asset acceptance, and CTA placement until per-asset GA4 event splits are available.',
      }
    }),
  )

  return {
    generatedAt: config.generatedAt,
    entries,
  }
}

function buildAssetPerformanceMarkdown(view) {
  if (safeArray(view?.entries).length === 0) {
    return '# Asset Performance View\n\nNo asset performance entries generated.\n'
  }

  return [
    '# Asset Performance View',
    '',
    ...view.entries.flatMap((entry) => [
      `## ${entry.siteSlug} / ${entry.assetSlug}`,
      '',
      `- strongest path: ${entry.strongestPath}`,
      `- submit rate: ${toPercentString(entry.modeledSubmitRate)}`,
      `- delivery rate: ${toPercentString(entry.modeledDeliveryRate)}`,
      `- deeper action rate: ${toPercentString(entry.modeledDeeperActionRate)}`,
      `- measurement mode: ${entry.measurementMode}`,
      `- note: ${entry.note}`,
      '',
    ]),
  ].join('\n')
}

function buildWikiWritebackQueue(sites, pageRefreshPlans, assetPerformanceView) {
  const assetPerformanceMap = new Map(
    safeArray(assetPerformanceView?.entries).map((entry) => [`${entry.siteSlug}/${entry.assetSlug}`, entry]),
  )

  return pageRefreshPlans.map((plan) => {
    const assetPerformance = assetPerformanceMap.get(`${plan.siteSlug}/${plan.linkedAssetSlug}`)
    return {
      siteSlug: plan.siteSlug,
      pageSlug: plan.pageSlug,
      pageType: plan.pageType,
      pageBriefId: plan.pageBriefId,
      claimIds: plan.linkedClaimIds,
      assetSlug: plan.linkedAssetSlug,
      writebackTargets: plan.writebackTargets,
      nextRewriteGoal: plan.nextRewriteGoal,
      strongestPath: assetPerformance?.strongestPath ?? '',
      performanceNote: assetPerformance
        ? assetPerformance.measurementMode === 'live_ops'
          ? assetPerformance.note
          : `Modeled deeper action rate ${toPercentString(assetPerformance.modeledDeeperActionRate)} via ${assetPerformance.strongestPath}.`
        : 'No linked asset performance row yet.',
      refreshTriggers: plan.refreshTriggers,
      status: 'queued',
    }
  })
}

function buildWikiWritebackMarkdown(entries) {
  if (entries.length === 0) {
    return '# Wiki Writeback Queue\n\nNo wiki writeback actions generated.\n'
  }

  return [
    '# Wiki Writeback Queue',
    '',
    ...entries.flatMap((entry) => [
      `## ${entry.siteSlug} / ${entry.pageSlug}`,
      '',
      `- brief: ${entry.pageBriefId || 'none'}`,
      `- asset: ${entry.assetSlug || 'none'}`,
      `- strongest path: ${entry.strongestPath || 'n/a'}`,
      `- performance note: ${entry.performanceNote}`,
      '',
      '### Writeback targets',
      ...formatMarkdownBullets(entry.writebackTargets),
      '',
      '### Refresh triggers',
      ...formatMarkdownBullets(entry.refreshTriggers),
      '',
    ]),
  ].join('\n')
}

function buildPhase2ExpansionTrigger(site, phase1Validation, assetPerformanceView, commercialIntentModel) {
  const siteAssetRows = safeArray(assetPerformanceView?.entries).filter((entry) => entry.siteSlug === site.siteSlug)
  const strongestAsset =
    siteAssetRows.sort((left, right) => right.modeledDeeperActionRate - left.modeledDeeperActionRate)[0] ?? null
  const siteCommercialIntent =
    safeArray(commercialIntentModel?.sites).find((entry) => entry.siteSlug === site.siteSlug) ?? null
  const criteria = [
    {
      key: 'visibility_signal',
      label: 'Single thesis shows real visibility',
      status:
        site.monitoring.impressions >= 500 ||
        site.monitoring.liveTop50KeywordCount >= 1 ||
        site.gates.expansion.day14.hasTop50Entry
          ? 'pass'
          : 'fail',
      detail:
        `${site.monitoring.impressions} impressions, ${site.monitoring.liveTop50KeywordCount} top-50 keywords, ` +
        `${site.gates.expansion.day14.hasTop50Entry ? 'has' : 'no'} top-50 entry.`,
    },
    {
      key: 'strong_asset',
      label: 'At least one asset has a stronger path',
      status:
        strongestAsset && strongestAsset.modeledDeliveryRate >= 0.18 && strongestAsset.modeledDeeperActionRate >= 0.06
          ? 'pass'
          : 'fail',
      detail: strongestAsset
        ? `${strongestAsset.assetSlug} currently leads with modeled delivery ${toPercentString(strongestAsset.modeledDeliveryRate)} and deeper action ${toPercentString(strongestAsset.modeledDeeperActionRate)}.`
        : 'No asset performance row exists yet.',
    },
    {
      key: 'deeper_action_path',
      label: 'At least one deeper commercial action exists',
      status: safeArray(siteCommercialIntent?.highIntentActions).length > 0 ? 'pass' : 'fail',
      detail: siteCommercialIntent
        ? `${siteCommercialIntent.highIntentActions.length} high-intent action(s) currently exist alongside ${siteCommercialIntent.lowFrictionActions.length} low-friction lead magnets.`
        : 'No commercial-intent map exists for this site yet.',
    },
    {
      key: 'phase1_validated',
      label: 'Phase 1 revenue validation is structurally clear',
      status: phase1Validation.status === 'validated' ? 'pass' : 'fail',
      detail: `Phase 1 status is ${phase1Validation.status}.`,
    },
  ]

  const passCount = criteria.filter((item) => item.status === 'pass').length
  const status = passCount === criteria.length ? 'ready' : passCount >= 2 ? 'watch' : 'blocked'

  return {
    generatedAt: config.generatedAt,
    thesisKey: site.cluster.thesisKey,
    siteSlug: site.siteSlug,
    status,
    allowSecondThesis: status === 'ready',
    allowMorePages: status !== 'blocked',
    strongestAsset:
      strongestAsset == null
        ? null
        : {
            assetSlug: strongestAsset.assetSlug,
            strongestPath: strongestAsset.strongestPath,
            modeledDeliveryRate: strongestAsset.modeledDeliveryRate,
            modeledDeeperActionRate: strongestAsset.modeledDeeperActionRate,
          },
    criteria,
    nextMoves:
      status === 'ready'
        ? [
            'Keep the winning asset path and test the second thesis without weakening the strongest commercial loop.',
            'Expand pages only after the stronger asset path keeps converting.',
          ]
        : [
            'Keep improving visibility, asset path quality, and deeper commercial actions before opening a second thesis.',
          ],
  }
}

function buildPhase2ExpansionMarkdown(trigger) {
  return [
    '# Phase 2 Expansion Trigger',
    '',
    `- thesis: ${trigger.thesisKey}`,
    `- site: ${trigger.siteSlug}`,
    `- status: ${trigger.status}`,
    `- allow second thesis: ${trigger.allowSecondThesis ? 'yes' : 'no'}`,
    `- allow more pages: ${trigger.allowMorePages ? 'yes' : 'no'}`,
    '',
    '## Criteria',
    ...trigger.criteria.flatMap((item) => [
      `- [${item.status === 'pass' ? 'x' : ' '}] ${item.label}`,
      `  - ${item.detail}`,
    ]),
    '',
    '## Next moves',
    ...formatMarkdownBullets(trigger.nextMoves),
    '',
  ].join('\n')
}

function buildForecastMetrics(site, runIndex, previousMetrics) {
  const scoreFactor = site.cluster.averageScore
  const pageDepth = site.pages.length
  const auditFactor = site.audit.score
  const impressions = Math.round(
    700 + scoreFactor * 34 + pageDepth * 180 + seededBetween(`${site.siteSlug}:impressions:${runIndex}`, 90, 360),
  )
  const ctr = clamp(
    round(0.021 + scoreFactor / 2400 + seededBetween(`${site.siteSlug}:ctr:${runIndex}`, 0.001, 0.018), 4),
    0.018,
    0.082,
  )
  const clicks = Math.round(impressions * ctr)
  const avgPosition = clamp(
    round(18.8 - scoreFactor / 8 - auditFactor / 18 + seededBetween(`${site.siteSlug}:position:${runIndex}`, -1.1, 1.6), 1),
    3.1,
    22.4,
  )
  const conversionRate = clamp(
    round(0.013 + auditFactor / 5200 + seededBetween(`${site.siteSlug}:cvr:${runIndex}`, 0.002, 0.022), 4),
    0.012,
    0.09,
  )
  const conversions = Math.max(1, Math.round(clicks * conversionRate))
  const revenue = round(
    conversions * seededBetween(`${site.siteSlug}:revenue:${runIndex}`, 38, 140),
    2,
  )

  return finalizeMonitoringMetrics({
    siteSlug: site.siteSlug,
    mode: 'heuristic_forecast',
    impressions,
    clicks,
    ctr,
    avgPosition,
    conversions,
    conversionRate,
    revenue,
    sessions: clicks,
    rankingSource: 'proxy',
    conversionSource: 'forecast',
    rankingQueryCount: Math.max(site.cluster.trackedKeywords.length, 1),
    liveTop50KeywordCount: 0,
    liveTop20KeywordCount: 0,
    gscStatus: 'skipped',
    ga4Status: 'skipped',
    gscLookbackDays: googleConfig.gscLookbackDays,
    ga4LookbackDays: googleConfig.ga4LookbackDays,
    conversionEvents: googleConfig.ga4ConversionEvents,
    notes: [],
  }, previousMetrics)
}

async function buildCurrentMetrics(site, runIndex, previousMetrics) {
  const forecastMetrics = buildForecastMetrics(site, runIndex, previousMetrics)

  if (!googleMonitoringEnabled()) {
    return {
      ...forecastMetrics,
      gscStatus: 'disabled',
      ga4Status: 'disabled',
      notes: ['MONITORING_MODE=heuristic_forecast keeps Gate 3 on the local forecast adapter.'],
    }
  }

  const [gscMetrics, ga4Metrics] = await Promise.all([
    fetchGscSiteMetrics(site),
    fetchGa4SiteMetrics(site),
  ])

  const useLiveGsc = ['live', 'no_data'].includes(gscMetrics.status)
  const useLiveGa4 = ['live', 'no_data'].includes(ga4Metrics.status)
  const rankingSource = useLiveGsc ? 'gsc' : 'proxy'
  const conversionSource = useLiveGa4 ? 'ga4' : 'forecast'
  const mode =
    useLiveGsc && useLiveGa4
      ? 'live_google'
      : useLiveGsc || useLiveGa4
        ? 'hybrid_google'
        : 'heuristic_forecast'
  const impressions = useLiveGsc ? gscMetrics.impressions : forecastMetrics.impressions
  const clicks = useLiveGsc ? gscMetrics.clicks : forecastMetrics.clicks
  const ctr = useLiveGsc ? gscMetrics.ctr : forecastMetrics.ctr
  const avgPosition = useLiveGsc ? gscMetrics.avgPosition : forecastMetrics.avgPosition
  const sessions = useLiveGa4 ? ga4Metrics.sessions : forecastMetrics.sessions
  const conversions = useLiveGa4 ? ga4Metrics.conversions : forecastMetrics.conversions
  const revenue = useLiveGa4 ? ga4Metrics.revenue : forecastMetrics.revenue
  const conversionRate =
    sessions > 0
      ? round(conversions / sessions, 4)
      : clicks > 0
        ? round(conversions / clicks, 4)
        : 0

  return finalizeMonitoringMetrics(
    {
      siteSlug: site.siteSlug,
      mode,
      impressions,
      clicks,
      ctr,
      avgPosition,
      conversions,
      conversionRate,
      revenue,
      sessions,
      rankingSource,
      conversionSource,
      rankingQueryCount: useLiveGsc
        ? gscMetrics.queryCount
        : forecastMetrics.rankingQueryCount,
      liveTop50KeywordCount: useLiveGsc ? gscMetrics.top50KeywordCount : 0,
      liveTop20KeywordCount: useLiveGsc ? gscMetrics.top20KeywordCount : 0,
      gscStatus: gscMetrics.status,
      ga4Status: ga4Metrics.status,
      gscLookbackDays: googleConfig.gscLookbackDays,
      ga4LookbackDays: googleConfig.ga4LookbackDays,
      conversionEvents: googleConfig.ga4ConversionEvents,
      notes: dedupe([
        ...forecastMetrics.notes,
        ...(gscMetrics.notes ?? []),
        ...(ga4Metrics.notes ?? []),
      ]),
    },
    previousMetrics,
  )
}

function buildSiteHistory(history, siteSlug) {
  return history
    .map((run) => {
      const site = run.sites.find((item) => item.siteSlug === siteSlug)
      if (!site) return null
      return {
        runId: run.runId,
        generatedAt: run.generatedAt,
        seeded: Boolean(run.seeded),
        ...site,
      }
    })
    .filter(Boolean)
}

function buildPhase1RevenueValidation(site, wikiSiteSummary = null) {
  if (!site) {
    return {
      thesisKey: experiment.thesisKey,
      siteSlug: experiment.siteSlug ?? '',
      status: 'needs_work',
      summary: 'No site was generated for the active thesis, so Phase 1 cannot be validated.',
      checklist: [],
      acceptance: [],
      nextMoves: ['Generate one site cluster before running Phase 1 validation.'],
    }
  }

  const assetReadyCount = safeArray(site.conversionAssets).filter(
    (asset) =>
      asset.landingPath &&
      asset.thankYouPath &&
      asset.downloadPath &&
      safeArray(asset.deliverables).length >= 2 &&
      safeArray(asset.deliverySteps).length >= 3,
  ).length
  const highIntentPageCount = site.pages.length
  const wikiCoreCount =
    (site.claims?.length ?? 0) + (site.pageBriefs?.length ?? 0) + (site.conversionAssets?.length ?? 0)
  const allPageCtasRouteToAssets = site.pages.every(
    (page) => typeof page.ctaHref === 'string' && page.ctaHref.includes('/generated-sites/'),
  )
  const ga4EventFlowReady = Boolean(googleConfig.ga4MeasurementId)
  const liveMonitoringReady =
    site.monitoring?.rankingSource === 'gsc' ||
    site.monitoring?.conversionSource === 'ga4' ||
    googleMonitoringEnabled()

  const checklist = [
    {
      key: 'single_thesis_scope',
      label: 'Single-thesis scope remains intact',
      status: site.cluster.thesisKey === experiment.thesisKey && site.siteSlug === experiment.siteSlug ? 'pass' : 'warning',
      detail: `${site.cluster.thesisKey} / ${site.siteSlug}`,
    },
    {
      key: 'publish_gate',
      label: 'Gate 2 is clear for live traffic',
      status: site.gates?.publish?.status === 'pass' ? 'pass' : 'fail',
      detail: `Gate 2 is currently ${site.gates?.publish?.status ?? 'unknown'} and audit status is ${site.audit?.status ?? 'unknown'}.`,
    },
    {
      key: 'high_intent_pages',
      label: '10-12 high-intent pages are ready',
      status: highIntentPageCount >= 10 && highIntentPageCount <= 12 ? 'pass' : highIntentPageCount >= 8 ? 'warning' : 'fail',
      detail: `${highIntentPageCount} pages generated for ${site.siteSlug}.`,
    },
    {
      key: 'wiki_backbone',
      label: 'Hermes Wiki backbone is strong enough to drive reuse',
      status: wikiCoreCount >= 10 ? 'pass' : wikiCoreCount >= 7 ? 'warning' : 'fail',
      detail: `${wikiCoreCount} core cards across claim, brief, and asset layers. Wiki summary asset count: ${wikiSiteSummary?.assetCount ?? site.conversionAssets.length}.`,
    },
    {
      key: 'asset_delivery',
      label: 'Real asset delivery flow exists',
      status:
        assetReadyCount === safeArray(site.conversionAssets).length && assetReadyCount > 0
          ? 'pass'
          : assetReadyCount > 0
            ? 'warning'
            : 'fail',
      detail: `${assetReadyCount}/${safeArray(site.conversionAssets).length} assets have landing, thank-you, download, and delivery steps.`,
    },
    {
      key: 'tracking',
      label: 'Tracking is wired for CTA, submit, and delivery events',
      status: ga4EventFlowReady ? 'pass' : 'warning',
      detail: ga4EventFlowReady
        ? `GA4 measurement ${googleConfig.ga4MeasurementId} is present.`
        : 'GA4 measurement ID is missing, so event instrumentation cannot be verified live.',
    },
    {
      key: 'commercial_path',
      label: 'At least one real commercial path exists',
      status:
        safeArray(site.conversionAssets).length > 0 &&
        site.pages.some((page) => (page.commercialModuleCount ?? 0) > 0)
          ? 'pass'
          : 'warning',
      detail: `${safeArray(site.conversionAssets).length} conversion assets and ${site.pages.filter((page) => (page.commercialModuleCount ?? 0) > 0).length} pages with commercial modules.`,
    },
  ]

  const acceptance = [
    {
      label: 'Every strong page routes to an asset landing page',
      status: allPageCtasRouteToAssets ? 'pass' : 'fail',
      detail: allPageCtasRouteToAssets
        ? 'All page CTAs now point to asset landing flows instead of other content pages.'
        : 'Some page CTAs still route to generic content surfaces.',
    },
    {
      label: 'Every asset has a form, thank-you page, and downloadable file',
      status:
        assetReadyCount === safeArray(site.conversionAssets).length && assetReadyCount > 0
          ? 'pass'
          : 'fail',
      detail: `${assetReadyCount}/${safeArray(site.conversionAssets).length} assets are fully deliverable.`,
    },
    {
      label: 'GA4 event chain exists for click -> submit -> delivery',
      status: ga4EventFlowReady ? 'pass' : 'warning',
      detail: ga4EventFlowReady
        ? 'asset_cta_click, asset_form_submit, conversion event, and asset_delivery are emitted in the static flow.'
        : 'Event handlers are rendered, but GA4 is not configured in this environment.',
    },
    {
      label: 'Gate 3 can read real GSC/GA4 signals when configured',
      status: liveMonitoringReady ? 'pass' : 'warning',
      detail: `${site.monitoring.rankingSource}/${site.monitoring.conversionSource} currently back the expansion gate.`,
    },
  ]

  const hardFail = checklist.some((item) => item.status === 'fail') || acceptance.some((item) => item.status === 'fail')
  const warningOnly =
    !hardFail &&
    [...checklist, ...acceptance].some((item) => item.status === 'warning')
  const status = hardFail ? 'needs_work' : warningOnly ? 'ready_for_traffic' : 'validated'

  return {
    thesisKey: site.cluster.thesisKey,
    siteSlug: site.siteSlug,
    status,
    summary:
      status === 'validated'
        ? 'The single-thesis revenue loop is structurally ready: strong pages, real asset delivery, and measurable events are in place.'
        : status === 'ready_for_traffic'
          ? 'The thesis is ready to receive traffic, but live measurement or a few commercial details still need tightening.'
          : 'Phase 1 still has structural gaps that should be fixed before scaling traffic or adding a second thesis.',
    checklist,
    acceptance,
    nextMoves:
      status === 'validated'
        ? ['Drive real traffic into the strongest pages and compare which asset delivers the first commercial signal.']
        : [
            'Tighten missing tracking or asset delivery gaps before adding more pages.',
            'Keep this thesis focused until one asset and one page type show a real conversion signal.',
          ],
  }
}

function buildPhase1ValidationMarkdown(phase1) {
  const checklistLines = phase1.checklist.flatMap((item) => [
    `- [${item.status === 'pass' ? 'x' : ' '}] ${item.label} (${item.status})`,
    `  - ${item.detail}`,
  ])
  const acceptanceLines = phase1.acceptance.flatMap((item) => [
    `- ${item.label} (${item.status})`,
    `  - ${item.detail}`,
  ])

  return [
    '# Phase 1 Revenue Validation',
    '',
    `- thesis: ${phase1.thesisKey}`,
    `- site: ${phase1.siteSlug}`,
    `- status: ${phase1.status}`,
    '',
    phase1.summary,
    '',
    '## Checklist',
    ...checklistLines,
    '',
    '## Acceptance',
    ...acceptanceLines,
    '',
    '## Next moves',
    ...formatMarkdownBullets(phase1.nextMoves),
    '',
  ].join('\n')
}

function summarizeCheckpointMomentum(siteHistory) {
  const checkpoints = siteHistory.filter((item) => !item.seeded).slice(-3)
  if (checkpoints.length < 2) {
    return {
      direction: 'limited',
      declineCheckpoints: 0,
      intervalStates: [],
    }
  }

  const intervalStates = []
  for (let index = 1; index < checkpoints.length; index += 1) {
    const previous = checkpoints[index - 1]
    const current = checkpoints[index]
    let positiveSignals = 0
    let negativeSignals = 0

    if (current.impressions > previous.impressions) positiveSignals += 1
    if (current.impressions < previous.impressions) negativeSignals += 1
    if (current.ctr > previous.ctr) positiveSignals += 1
    if (current.ctr < previous.ctr) negativeSignals += 1
    if (current.conversions > previous.conversions) positiveSignals += 1
    if (current.conversions < previous.conversions) negativeSignals += 1
    if (current.avgPosition < previous.avgPosition) positiveSignals += 1
    if (current.avgPosition > previous.avgPosition) negativeSignals += 1

    intervalStates.push(
      negativeSignals >= 3 ? 'down' : positiveSignals >= 3 ? 'up' : 'mixed',
    )
  }

  let declineCheckpoints = 0
  for (let index = intervalStates.length - 1; index >= 0; index -= 1) {
    if (intervalStates[index] !== 'down') break
    declineCheckpoints += 1
  }

  return {
    direction:
      declineCheckpoints >= 2
        ? 'down'
        : intervalStates.every((item) => item === 'up')
          ? 'up'
          : intervalStates.some((item) => item === 'up') && intervalStates.some((item) => item === 'down')
            ? 'mixed'
            : intervalStates.includes('mixed')
              ? 'mixed'
              : intervalStates.at(-1) ?? 'limited',
    declineCheckpoints,
    intervalStates,
  }
}

function deriveRankingSignals(site, metrics, rules14, rules30) {
  if (metrics.rankingSource === 'gsc') {
    const trackedKeywordCount = Math.max(metrics.rankingQueryCount, 1)

    return {
      source: 'gsc',
      trackedKeywordCount,
      top50KeywordCount: clamp(metrics.liveTop50KeywordCount, 0, trackedKeywordCount),
      top20KeywordCount: clamp(metrics.liveTop20KeywordCount, 0, trackedKeywordCount),
      hasTop50Entry: metrics.liveTop50KeywordCount >= 1,
      hasTop20Entry: metrics.liveTop20KeywordCount >= 1,
    }
  }

  const trackedKeywordCount = Math.max(site.cluster.trackedKeywords.length, 1)
  const top50KeywordCount = clamp(
    Math.round(
      trackedKeywordCount *
        clamp(round((rules14.top50ProxyPositionMax - metrics.avgPosition + 8) / rules14.top50ProxyPositionMax, 2), 0, 1),
    ),
    0,
    trackedKeywordCount,
  )
  const top20KeywordCount = clamp(
    Math.round(
      trackedKeywordCount *
        clamp(round((rules30.top20ProxyPositionMax - metrics.avgPosition + 4) / rules30.top20ProxyPositionMax, 2), 0, 1),
    ),
    0,
    trackedKeywordCount,
  )

  return {
    source: 'proxy',
    trackedKeywordCount,
    top50KeywordCount,
    top20KeywordCount,
    hasTop50Entry:
      metrics.avgPosition <= rules14.top50ProxyPositionMax && top50KeywordCount >= 1,
    hasTop20Entry:
      metrics.avgPosition <= rules30.top20ProxyPositionMax && top20KeywordCount >= 1,
  }
}

function deriveOptimization(site, metrics, expansionGate) {
  const actions = []

  if (expansionGate.day14.status === 'fix_indexing') {
    actions.push({
      priority: 'high',
      title: 'Check robots, sitemap, and indexable pages',
      reason: expansionGate.day14.reason,
    })
  }

  if (
    expansionGate.day14.status === 'optimize_snippet' ||
    expansionGate.day30.status === 'optimize'
  ) {
    actions.push({
      priority: 'high',
      title: 'Rewrite titles, descriptions, and click-driving visuals',
      reason: expansionGate.day30.status === 'optimize'
        ? expansionGate.day30.reason
        : expansionGate.day14.reason,
    })
  }

  if (expansionGate.day30.status === 'invest') {
    actions.push({
      priority: 'medium',
      title: 'Invest in the winners now',
      reason: expansionGate.day30.reason,
    })
  }

  if (metrics.avgPosition > 11 && expansionGate.day30.status !== 'stop') {
    actions.push({
      priority: 'medium',
      title: 'Add stronger internal links and supporting pages',
      reason: `Average position is ${metrics.avgPosition}, so relevance and depth need help.`,
    })
  }

  if (metrics.clicks > 70 && metrics.conversionRate < 0.028) {
    actions.push({
      priority: 'medium',
      title: 'Strengthen the lead magnet CTA',
      reason: `Conversion rate is ${toPercentString(metrics.conversionRate)} despite real click volume.`,
    })
  }

  if (site.audit.issues.length > 0) {
    actions.push({
      priority: 'medium',
      title: 'Clear audit warnings before scaling',
      reason: `${site.audit.issues.length} audit issue(s) remain open.`,
    })
  }

  if (expansionGate.day30.status === 'stop') {
    actions.push({
      priority: 'high',
      title: 'Pause expansion and review whether to retire the cluster',
      reason: expansionGate.day30.reason,
    })
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'low',
      title: 'Keep shipping related comparisons',
      reason: expansionGate.day30.reason,
    })
  }

  return actions
}

function deriveLifecycle(site, metrics, expansionGate) {
  if (expansionGate.day30.status === 'invest') {
    return {
      state: 'expand',
      reason: expansionGate.day30.reason,
      nextMove: 'apply more resources to the best-ranking pages and start external promotion',
    }
  }

  if (expansionGate.day30.status === 'expand') {
    return {
      state: 'expand',
      reason: expansionGate.day30.reason,
      nextMove: site.cluster.expansionIdeas[0],
    }
  }

  if (expansionGate.day14.status === 'fix_indexing') {
    return {
      state: 'watch',
      reason: expansionGate.day14.reason,
      nextMove: expansionGate.day14.nextAction,
    }
  }

  if (expansionGate.day30.status === 'stop') {
    return {
      state: 'retire',
      reason: expansionGate.day30.reason,
      nextMove: expansionGate.day30.nextAction,
    }
  }

  if (expansionGate.day30.status === 'optimize') {
    return {
      state: 'maintain',
      reason: expansionGate.day30.reason,
      nextMove: expansionGate.day30.nextAction,
    }
  }

  return {
    state: 'maintain',
    reason: expansionGate.day30.reason,
    nextMove: expansionGate.day30.nextAction,
  }
}

function evaluateExpansionGate(site, metrics, siteHistory) {
  const rules14 = experiment.gateRules.expansionGate.day14
  const rules30 = experiment.gateRules.expansionGate.day30
  const indexablePageRatio = round(
    site.pages.filter((page) => page.indexingDirective !== 'noindex').length /
      Math.max(site.pages.length, 1),
    2,
  )
  const indexedPageRatio = clamp(
    round(
      indexablePageRatio *
        (0.38 + metrics.impressions / 5200 + seededBetween(`${site.siteSlug}:index-ratio`, 0.02, 0.2)),
      2,
    ),
    0,
    0.96,
  )
  const rankingSignals = deriveRankingSignals(site, metrics, rules14, rules30)
  const momentum = summarizeCheckpointMomentum(siteHistory)

  let day14Status = 'observe'
  let day14Reason = 'Signals are forming, but this checkpoint does not justify a strong move yet.'
  let day14NextAction = 'Keep the site live and review the next checkpoint before adding more pages.'

  if (indexablePageRatio < 1 || indexedPageRatio < rules14.minIndexedPageRatio) {
    day14Status = 'fix_indexing'
    day14Reason =
      indexablePageRatio < 1
        ? 'Some pages are still noindex or blocked, so the site may be suppressing its own discovery.'
        : `Indexed page ratio is ${indexedPageRatio}, below the ${rules14.minIndexedPageRatio} launch threshold.`
    day14NextAction = 'Check robots, sitemap submission, and whether any page is still preview-only.'
  } else if (
    metrics.impressions >= rules14.healthyImpressions &&
    metrics.ctr >= rules14.healthyCtr &&
    rankingSignals.hasTop50Entry
  ) {
    day14Status = 'expand'
    day14Reason =
      'Early impressions, CTR, and ranking signals are healthy enough to justify another support page.'
    day14NextAction = site.cluster.expansionIdeas[0]
  } else if (metrics.impressions < rules14.minImpressions && !rankingSignals.hasTop50Entry) {
    day14Status = 'stop'
    day14Reason =
      'The site is not surfacing in search yet and has not cleared the minimum demand threshold.'
    day14NextAction = 'Pause content expansion and verify whether this thesis deserves another cycle.'
  } else if (metrics.ctr < rules14.poorCtr) {
    day14Status = 'optimize_snippet'
    day14Reason = `CTR is ${toPercentString(metrics.ctr)}, so the title, description, or visual hook is underperforming.`
    day14NextAction = 'Rewrite title and description, then retest before adding pages.'
  }

  const day14 = {
    indexedPageRatio,
    indexablePageRatio,
    impressions: metrics.impressions,
    ctr: metrics.ctr,
    avgPosition: metrics.avgPosition,
    hasTop50Entry: rankingSignals.hasTop50Entry,
    top50KeywordCount: rankingSignals.top50KeywordCount,
    trackedKeywordCount: rankingSignals.trackedKeywordCount,
    status: day14Status,
    reason: day14Reason,
    nextAction: day14NextAction,
  }

  const hasCommercialSignal = metrics.conversions > 0
  let day30Status = 'observe'
  let day30Reason = 'The site is viable, but the last checkpoint still points to normal iteration rather than aggressive scaling.'
  let day30NextAction = 'Keep monitoring queries and refresh the strongest support page on the next cycle.'

  if (
    momentum.declineCheckpoints >= rules30.declineCheckpointsToStop
  ) {
    day30Status = 'stop'
    day30Reason =
      'Two checkpoints in a row are sliding on traffic, click, and ranking signals, so the cluster is losing momentum.'
    day30NextAction = 'Pause expansion, audit the thesis, and decide whether to retire or merge the content.'
  } else if (
    metrics.impressions >= rules30.healthyImpressions &&
    metrics.ctr >= rules30.healthyCtr &&
    (!rules30.requiresCommercialSignal || hasCommercialSignal) &&
    rankingSignals.hasTop20Entry
  ) {
    day30Status = 'invest'
    day30Reason =
      'The site has healthy traffic, clears the CTR bar, shows commercial signal, and now has a top-20 ranking signal.'
    day30NextAction = 'Add more support pages and start external link and distribution work on the winners.'
  } else if (
    metrics.impressions >= rules30.healthyImpressions &&
    metrics.ctr >= rules30.healthyCtr &&
    (!rules30.requiresCommercialSignal || hasCommercialSignal)
  ) {
    day30Status = 'expand'
    day30Reason =
      'The site is healthy enough to add more pages, but it has not yet reached the top-20 investment threshold.'
    day30NextAction = site.cluster.expansionIdeas[0]
  } else if (metrics.impressions < rules30.poorImpressions && !hasCommercialSignal) {
    day30Status = 'stop'
    day30Reason =
      'Traffic is still below the minimum threshold and there is no commercial response to justify more effort.'
    day30NextAction = 'Retire this cluster or merge its best ideas into a stronger site.'
  } else if (metrics.ctr < rules30.poorCtr) {
    day30Status = 'optimize'
    day30Reason = `CTR is ${toPercentString(metrics.ctr)}, so the page is being seen but not chosen often enough.`
    day30NextAction = 'Test new titles, descriptions, and entry visuals before creating more pages.'
  } else if (!rankingSignals.hasTop20Entry || !hasCommercialSignal) {
    day30Status = 'observe'
    day30Reason =
      !rankingSignals.hasTop20Entry
        ? 'The site is visible, but it still needs a stronger ranking foothold before heavier investment.'
        : 'Traffic exists, but the commercial signal is still too weak to justify aggressive scaling.'
    day30NextAction =
      !rankingSignals.hasTop20Entry
        ? 'Improve the strongest pages and wait for a top-20 entry before spending expansion budget.'
        : 'Strengthen the CTA and conversion path before expanding the footprint.'
  }

  return {
    day14,
    day30: {
      impressions: metrics.impressions,
      ctr: metrics.ctr,
      avgPosition: metrics.avgPosition,
      conversions: metrics.conversions,
      hasCommercialSignal,
      hasTop20Entry: rankingSignals.hasTop20Entry,
      top20KeywordCount: rankingSignals.top20KeywordCount,
      trackedKeywordCount: rankingSignals.trackedKeywordCount,
      momentum: momentum.direction,
      declineCheckpoints: momentum.declineCheckpoints,
      intervalStates: momentum.intervalStates,
      status: day30Status,
      reason: day30Reason,
      nextAction: day30NextAction,
    },
    overall:
      day30Status === 'expand' || day30Status === 'invest'
        ? 'pass'
        : day30Status === 'optimize' ||
            day14.status === 'optimize_snippet' ||
            day14.status === 'fix_indexing'
          ? 'needs_work'
        : day30Status === 'stop'
          ? 'fail'
            : 'observe',
  }
}

function buildDecisionRows(sites) {
  return sites.map((site) => {
    const approvedOpps = site.cluster.opportunities
    const averageTrendScore = round(
      approvedOpps.reduce((sum, item) => sum + item.confidence, 0) / approvedOpps.length,
    )
    const averageCommercialFit = round(
      approvedOpps.reduce((sum, item) => sum + item.commercialFit, 0) / approvedOpps.length,
    )

    return {
      thesis: site.cluster.thesisName,
      trendScore: averageTrendScore,
      commercialIntent: averageCommercialFit,
      supportPages: approvedOpps.reduce((sum, item) => sum + item.supportPageIdeas.length, 0),
      gate1: site.gates.opportunity.status,
      publishPages: site.pages.length,
      averageQualityScore: site.audit.score,
      gate2: site.gates.publish.status,
      day30Impressions: site.monitoring.impressions,
      gate3: site.gates.expansion.day30.status,
      conclusion: site.lifecycle.state,
    }
  })
}

function buildDecisionMarkdown(rows) {
  const header =
    '| thesis | trendScore | commercialIntent | supportPages | gate1 | publishPages | averageQualityScore | gate2 | 30dayImpressions | gate3 | conclusion |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'

  const body = rows
    .map(
      (row) =>
        `| ${row.thesis} | ${row.trendScore} | ${row.commercialIntent} | ${row.supportPages} | ${row.gate1} | ${row.publishPages} | ${row.averageQualityScore} | ${row.gate2} | ${row.day30Impressions} | ${row.gate3} | ${row.conclusion} |`,
    )
    .join('\n')

  return `${header}${body}\n`
}

function buildReviewQueue(sites) {
  return sites.flatMap((site) =>
    (site.pageArtifacts ?? [])
      .filter((page) => page.reviewSignals?.needsSpotCheck)
      .map((page) => ({
        siteSlug: site.siteSlug,
        pageSlug: page.slug,
        pageType: page.type,
        reviewMode: contentConfig.reviewMode,
        draftEngine: page.draftEngine,
        reasons: page.reviewSignals.reasons,
        verdictCount: page.contentStats?.verdictCount ?? 0,
        factCount: page.contentStats?.factCount ?? 0,
        exampleCount: page.contentStats?.exampleCount ?? 0,
        sourceRefCount: page.contentStats?.sourceRefCount ?? 0,
        ctaTitle: page.ctaTitle,
      })),
  )
}

function buildAssetReviewQueue(sites) {
  return sites.flatMap((site) =>
    safeArray(site.conversionAssets)
      .filter((asset) => {
        const acceptance = asset.acceptance
        if (!acceptance) return false
        return acceptance.gateStatus !== 'pass' || acceptance.acceptanceMode !== 'A'
      })
      .map((asset) => ({
        siteSlug: site.siteSlug,
        assetSlug: asset.slug,
        assetTitle: asset.title,
        assetKind: asset.assetKind,
        acceptanceMode: asset.acceptance.acceptanceMode,
        acceptanceStatus: asset.acceptance.acceptanceStatus,
        totalScore: asset.acceptance.totalScore,
        estimatedReviewMinutes: asset.acceptance.estimatedReviewMinutes,
        reviewRequired: asset.acceptance.reviewRequired,
        failedChecks: safeArray(asset.acceptance.failedChecks).map((check) => check.label),
        reviewerPrompt: asset.acceptance.reviewerPrompt,
        rewriteInstructions: safeArray(asset.acceptance.rewriteInstructions),
        suggestedAction:
          asset.acceptance.acceptanceStatus === 'rewrite_required'
            ? 'rewrite'
            : asset.acceptance.acceptanceMode === 'C'
              ? 'escalate'
              : 'accept',
        strongestUseCase: asset.strongestUseCase,
        bestPageTypes: asset.bestPageTypes,
        landingPath: asset.landingPath,
        thankYouPath: asset.thankYouPath,
        downloadPath: asset.downloadPath,
      })),
  )
}

function buildReviewOverrideIndex(payload) {
  const pages = Array.isArray(payload?.pages) ? payload.pages : []
  return new Map(
    pages
      .filter((item) => item.siteSlug && item.pageSlug)
      .map((item) => [`${item.siteSlug}/${item.pageSlug}`, item]),
  )
}

function applyReviewOverride(page, override) {
  if (!override) return page

  const nextPage = { ...page }

  if (typeof override.intro === 'string' && override.intro.trim()) {
    nextPage.intro = override.intro.trim()
  }

  if (typeof override.ctaCopy === 'string' && override.ctaCopy.trim()) {
    nextPage.ctaCopy = override.ctaCopy.trim()
  }

  if (Array.isArray(override.verdicts) && override.verdicts.length > 0) {
    nextPage.verdicts = override.verdicts
  }

  if (Array.isArray(override.keyFacts) && override.keyFacts.length > 0) {
    nextPage.keyFacts = override.keyFacts
  }

  if (Array.isArray(override.sectionParagraphs) && Array.isArray(nextPage.sections)) {
    nextPage.sections = nextPage.sections.map((section, index) => ({
      ...section,
      paragraphs:
        Array.isArray(override.sectionParagraphs[index]) && override.sectionParagraphs[index].length > 0
          ? override.sectionParagraphs[index]
          : section.paragraphs,
    }))
  }

  nextPage.manualReview = {
    reviewedAt: override.reviewedAt ?? config.generatedAt,
    reviewer: override.reviewer ?? 'manual',
    notes: override.notes ?? '',
  }

  if (nextPage.reviewSignals?.needsSpotCheck) {
    nextPage.reviewSignals = {
      ...nextPage.reviewSignals,
      needsSpotCheck: false,
      reasons: ['Manual override applied from review-overrides.json'],
    }
  }

  return nextPage
}

function buildReviewQueueMarkdown(entries) {
  if (entries.length === 0) {
    return '# Review Queue\n\nNo pages currently need a spot-check.\n'
  }

  return [
    '# Review Queue',
    '',
    ...entries.map(
      (entry) =>
        `- ${entry.siteSlug}/${entry.pageSlug}: ${entry.pageType} | facts ${entry.factCount} | verdicts ${entry.verdictCount} | examples ${entry.exampleCount} | refs ${entry.sourceRefCount} | ${entry.reasons.join(' / ')}`,
    ),
    '',
  ].join('\n')
}

function buildAssetReviewQueueMarkdown(entries) {
  if (entries.length === 0) {
    return '# Asset Review Queue\n\nNo assets currently need human review.\n'
  }

  return [
    '# Asset Review Queue',
    '',
    ...entries.map(
      (entry) =>
        `- ${entry.siteSlug}/${entry.assetSlug}: mode ${entry.acceptanceMode} | status ${entry.acceptanceStatus} | score ${entry.totalScore} | action ${entry.suggestedAction} | checks ${entry.failedChecks.join(', ') || 'none'}`,
    ),
    '',
  ].join('\n')
}

function buildReviewOverrideTemplate(sites) {
  return {
    generatedAt: config.generatedAt,
    instructions: [
      'Copy this file to storage/review-overrides.json and edit only the fields you want to override.',
      'Supported fields per page: intro, ctaCopy, verdicts, keyFacts, sectionParagraphs, reviewer, reviewedAt, notes.',
    ],
    pages: sites.flatMap((site) =>
      (site.pageArtifacts ?? [])
        .filter((page) => page.reviewSignals?.needsSpotCheck)
        .map((page) => ({
          siteSlug: site.siteSlug,
          pageSlug: page.slug,
          pageType: page.type,
          reviewer: '',
          reviewedAt: '',
          notes: '',
          intro: page.intro,
          ctaCopy: page.ctaCopy,
          verdicts: page.verdicts ?? [],
          keyFacts: page.keyFacts ?? [],
          sectionParagraphs: (page.sections ?? []).map((section) => section.paragraphs ?? []),
        })),
    ),
  }
}

function buildContentFeedback(sites, history) {
  const recentRuns = history.slice(-6)
  const pageTypeRows = sites.flatMap((site) =>
    (site.pageArtifacts ?? []).map((page) => ({
      siteSlug: site.siteSlug,
      pageSlug: page.slug,
      pageType: page.type,
      facts: page.contentStats?.factCount ?? 0,
      verdicts: page.contentStats?.verdictCount ?? 0,
      examples: page.contentStats?.exampleCount ?? 0,
      refs: page.contentStats?.sourceRefCount ?? 0,
      revenue: site.monitoring?.revenue ?? 0,
      impressions: site.monitoring?.impressions ?? 0,
      conversions: site.monitoring?.conversions ?? 0,
    })),
  )

  const byPageType = {}
  for (const row of pageTypeRows) {
    if (!byPageType[row.pageType]) {
      byPageType[row.pageType] = {
        pageType: row.pageType,
        pageCount: 0,
        totalFacts: 0,
        totalVerdicts: 0,
        totalExamples: 0,
        totalRefs: 0,
        totalImpressions: 0,
        totalConversions: 0,
      }
    }
    const bucket = byPageType[row.pageType]
    bucket.pageCount += 1
    bucket.totalFacts += row.facts
    bucket.totalVerdicts += row.verdicts
    bucket.totalExamples += row.examples
    bucket.totalRefs += row.refs
    bucket.totalImpressions += row.impressions
    bucket.totalConversions += row.conversions
  }

  return {
    generatedAt: config.generatedAt,
    recentRuns: recentRuns.map((run) => ({
      runId: run.runId,
      generatedAt: run.generatedAt,
      mode: run.mode,
    })),
    pageTypeSignals: Object.values(byPageType).map((bucket) => ({
      ...bucket,
      averageFacts: round(bucket.totalFacts / Math.max(bucket.pageCount, 1), 1),
      averageVerdicts: round(bucket.totalVerdicts / Math.max(bucket.pageCount, 1), 1),
      averageExamples: round(bucket.totalExamples / Math.max(bucket.pageCount, 1), 1),
      averageRefs: round(bucket.totalRefs / Math.max(bucket.pageCount, 1), 1),
      guidance:
        bucket.totalConversions > 0
          ? 'Keep reinforcing this page type with stronger examples and CTAs.'
          : 'If this page type stays weak, increase examples, clearer verdicts, and more specific source evidence.',
    })),
    siteRecommendations: sites.map((site) => ({
      siteSlug: site.siteSlug,
      lifecycle: site.lifecycle?.state ?? 'unknown',
      nextMove: site.lifecycle?.nextMove ?? '',
      contentActions: site.optimization?.map((item) => item.title) ?? [],
    })),
  }
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null

  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function fetchTrendTopics() {
  try {
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 TrendSitePipeline/1.0' },
    })

    if (!response.ok) {
      throw new Error(`Feed request failed: ${response.status}`)
    }

    const xml = await response.text()
    const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map((match) => match[1]?.trim())
      .slice(1)
      .filter(Boolean)
      .filter((value) => !value.includes('Google Trends'))
      .filter((value) => discoveryPattern.test(value))
      .slice(0, config.maxDiscoveredTopics - seedTopics.length)
      .map((keyword) => ({
        keyword,
        source: 'Google Trends Daily RSS (US)',
        region: 'US',
        categoryHint: experiment.thesisKey,
      }))

    return titles
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    console.warn(`RSS fetch failed, continuing with seeds only: ${reason}`)
    return []
  }
}

async function ensureDirectories() {
  await mkdir(generatedDir, { recursive: true })
  await rm(artifactsDir, { recursive: true, force: true })
  await mkdir(artifactsDir, { recursive: true })
  await mkdir(storageDir, { recursive: true })
  await mkdir(wikiRoot, { recursive: true })
  await Promise.all(
    Object.values(wikiDirectoryMap).map((directory) => mkdir(directory, { recursive: true })),
  )
  await rm(sitesRoot, { recursive: true, force: true })
  await mkdir(sitesRoot, { recursive: true })
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

async function writeMarkdown(filePath, content) {
  await writeFile(filePath, `${content.trimEnd()}\n`)
}

async function writeWikiCard(directoryKey, fileName, frontmatter, sections) {
  const filePath = path.join(wikiDirectoryMap[directoryKey], fileName)
  await writeMarkdown(filePath, buildWikiCardMarkdown(frontmatter, sections))
  return filePath
}

async function readWikiCards(directoryKey, prefix) {
  const directory = wikiDirectoryMap[directoryKey]
  const fileNames = await readdir(directory)
  const matchingFiles = fileNames.filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith('.md'))
  const cards = []

  for (const fileName of matchingFiles) {
    const filePath = path.join(directory, fileName)
    const markdown = await readFile(filePath, 'utf8')
    cards.push({
      fileName,
      filePath,
      ...parseWikiCardMarkdown(markdown),
    })
  }

  return cards
}

async function removeWikiCardsByPrefix(directoryKey, prefix, keepFileNames = []) {
  const directory = wikiDirectoryMap[directoryKey]
  const keep = new Set(keepFileNames)
  const fileNames = await readdir(directory)
  const staleFiles = fileNames.filter(
    (fileName) => fileName.startsWith(prefix) && fileName.endsWith('.md') && !keep.has(fileName),
  )
  await Promise.all(staleFiles.map((fileName) => rm(path.join(directory, fileName), { force: true })))
}

function hydrateWikiClaimCard(card, siteSlug) {
  const frontmatter = card.frontmatter ?? {}
  const hydrated = {
    id: frontmatter.id,
    type: 'claim',
    thesisId: frontmatter.thesis_id,
    clusterId: frontmatter.cluster_id,
    pageTypes: safeArray(frontmatter.page_types),
    claimKind: frontmatter.claim_kind ?? 'definition',
    decisionStage: frontmatter.decision_stage ?? 'discover',
    confidence: Number(frontmatter.confidence ?? 0.62),
    freshness: frontmatter.freshness ?? 'manual',
    sourceIds: safeArray(frontmatter.source_ids).map((value) => normalizeWikiSourceId(value, siteSlug)),
    status: frontmatter.status ?? 'active',
    statement: getWikiSectionText(card.sections, 'Claim'),
    whyItMatters: getWikiSectionText(card.sections, 'Why it matters'),
    evidence: getWikiSectionList(card.sections, 'Evidence'),
    counterpoint: getWikiSectionText(card.sections, 'Counterpoint / limitation'),
    bestPageTypes: getWikiSectionList(card.sections, 'Best page types to use this in'),
    reusePriority: frontmatter.reuse_priority ?? getWikiSectionText(card.sections, 'Reuse priority') ?? 'medium',
    performanceNote: getWikiSectionText(card.sections, 'Performance note'),
    lifecycleDecision: frontmatter.lifecycle_decision ?? getWikiSectionText(card.sections, 'Lifecycle decision') ?? 'active',
    refreshCondition: getWikiSectionText(card.sections, 'Refresh condition'),
    manualSource: card.filePath,
  }
  hydrated.qualityScore = preferFiniteNumber(
    frontmatter.quality_score,
    getWikiSectionText(card.sections, 'Quality score'),
    computeClaimQualityScore(hydrated),
  )
  return hydrated
}

function hydrateWikiPageBriefCard(card) {
  const frontmatter = card.frontmatter ?? {}
  const hydrated = {
    id: frontmatter.id,
    type: 'page_brief',
    thesisId: frontmatter.thesis_id,
    clusterId: frontmatter.cluster_id,
    pageType: frontmatter.page_type,
    targetIntent: frontmatter.target_intent,
    targetAsset: frontmatter.target_asset,
    primaryClaimIds: safeArray(frontmatter.primary_claim_ids),
    secondaryClaimIds: safeArray(frontmatter.secondary_claim_ids),
    requiredSections: safeArray(frontmatter.required_sections),
    ctaStrategy: frontmatter.cta_strategy,
    reviewPriority: frontmatter.review_priority,
    pageGoal: getWikiSectionText(card.sections, 'Page goal'),
    visitorIntent: getWikiSectionText(card.sections, 'Visitor intent'),
    mustWinQuestions: getWikiSectionList(card.sections, 'Must-win questions'),
    requiredExamples: getWikiSectionList(card.sections, 'Required examples'),
    requiredCaveats: getWikiSectionList(card.sections, 'Required caveats'),
    failureConditions: getWikiSectionList(card.sections, 'Failure conditions'),
    manualSource: card.filePath,
  }
  hydrated.completenessScore = preferFiniteNumber(
    frontmatter.completeness_score,
    getWikiSectionText(card.sections, 'Completeness score'),
    computePageBriefCompletenessScore(hydrated),
  )
  return hydrated
}

function hydrateWikiAssetCard(card) {
  const frontmatter = card.frontmatter ?? {}
  const hydrated = {
    id: frontmatter.id,
    type: 'conversion_asset',
    thesisId: frontmatter.thesis_id,
    assetKind: frontmatter.asset_kind,
    status: frontmatter.status ?? 'active',
    intentStage: frontmatter.intent_stage,
    deliveryMode: frontmatter.delivery_mode,
    primaryPages: safeArray(frontmatter.primary_pages),
    conversionEvent: frontmatter.conversion_event,
    refreshCycle: frontmatter.refresh_cycle,
    slug: extractWikiAssetSlug(frontmatter.id),
    promise: getWikiSectionText(card.sections, 'Asset promise'),
    audience: getWikiSectionText(card.sections, 'Who it is for'),
    summary: getWikiSectionText(card.sections, 'What the visitor receives'),
    whyItConverts: getWikiSectionText(card.sections, 'Why it converts'),
    placementRules: getWikiSectionList(card.sections, 'Placement rules'),
    deliveryRules: getWikiSectionList(card.sections, 'Delivery rules'),
    strongestUseCase: getWikiSectionText(card.sections, 'Strongest use case'),
    bestPageTypes: getWikiSectionList(card.sections, 'Best page types'),
    conversionQualityNote: getWikiSectionText(card.sections, 'Conversion quality note'),
    refreshPriority: frontmatter.refresh_priority ?? getWikiSectionText(card.sections, 'Refresh priority') ?? 'medium',
    acceptanceMode: frontmatter.acceptance_mode ?? getWikiSectionText(card.sections, 'Acceptance mode'),
    acceptanceStatus: frontmatter.acceptance_status ?? getWikiSectionText(card.sections, 'Acceptance status'),
    acceptedVersion: frontmatter.accepted_version ?? getWikiSectionText(card.sections, 'Accepted version'),
    lastHumanReviewNote: getWikiSectionText(card.sections, 'Last human review note'),
    manualSource: card.filePath,
  }
  hydrated.reuseScore = preferFiniteNumber(
    frontmatter.reuse_score,
    getWikiSectionText(card.sections, 'Reuse score'),
    computeAssetReuseScore(hydrated),
  )
  return hydrated
}

function normalizePageTemplateType(pageType) {
  if (pageType === 'best-of') return 'best-tools'
  if (pageType === 'use-case') return 'use-cases'
  if (pageType === 'template') return 'template-kit'
  return pageType
}

async function loadWikiSeedBundle(cluster) {
  const siteSlug = cluster.siteSlug
  const [claimCards, briefCards, assetCards] = await Promise.all([
    readWikiCards('claims', `claim.${siteSlug}.`),
    readWikiCards('pageBriefs', `page-brief.${siteSlug}.`),
    readWikiCards('assets', `asset.${siteSlug}.`),
  ])

  return {
    claims: claimCards
      .map((card) => hydrateWikiClaimCard(card, siteSlug))
      .filter(
        (card) =>
          card.id &&
          (
            meaningfulText(card.statement) ||
            meaningfulText(card.whyItMatters) ||
            meaningfulList(card.evidence).length > 0
          ),
      ),
    pageBriefs: briefCards.map(hydrateWikiPageBriefCard).filter((card) => card.id && card.pageType),
    assets: assetCards.map(hydrateWikiAssetCard).filter((card) => card.id),
  }
}

async function exportWikiAssets({
  thesisRegistry,
  enrichedSites,
  routingSummary,
  contentFeedback,
  contentPlaybook,
  pageRefreshPlans,
  wikiWritebackQueue,
  assetPerformanceView,
  phase2ExpansionTrigger,
  currentRunSnapshot,
}) {
  const exported = {
    generatedAt: config.generatedAt,
    rootDir: wikiRoot,
    files: {
      theses: [],
      clusters: [],
      sources: [],
      claims: [],
      pageBriefs: [],
      assets: [],
      reviews: [],
      experiments: [],
    },
    sites: [],
  }

  function estimateFreshnessScore(source) {
    const year = source.detectedYear
    if (!year) return 72
    const currentYear = new Date().getUTCFullYear()
    if (year >= currentYear) return 92
    if (year === currentYear - 1) return 80
    if (year === currentYear - 2) return 64
    return 48
  }

  function estimateCredibilityScore(source) {
    if (looksLikeCommunitySource(source)) return 58
    if (source.category === 'official') return 92
    if (source.category === 'competitive') return 74
    if (source.category === 'workflow') return 78
    return 70
  }

  const refreshPlanMap = new Map(
    safeArray(pageRefreshPlans).map((item) => [`${item.siteSlug}/${item.pageType}`, item]),
  )
  const writebackQueueMap = new Map(
    safeArray(wikiWritebackQueue).map((item) => [`${item.siteSlug}/${item.pageType}`, item]),
  )
  const assetPerformanceMap = new Map(
    safeArray(assetPerformanceView?.entries).map((item) => [`${item.siteSlug}/${item.assetSlug}`, item]),
  )

  for (const thesis of thesisRegistry) {
    const runtime = thesisRuntimeMap.get(thesis.thesisKey) ?? buildThesisRuntime(thesis)
    const relatedSites = enrichedSites.filter((site) => site.cluster.thesisKey === thesis.thesisKey)
    const thesisId = toWikiId('thesis', thesis.thesisKey)
    const thesisPath = await writeWikiCard(
      'theses',
      `thesis.${thesis.thesisKey}.md`,
      {
        id: thesisId,
        type: 'thesis',
        status: thesis.status,
        label: thesis.label,
        audience: thesis.audience,
        problem: thesis.brandBoundary,
        offer: runtime.offer,
        monetization: runtime.monetization,
        primary_domain: thesis.domain,
        seed_keywords: thesis.seedKeywords,
        content_assets: runtime.contentAssets,
      },
      [
        {
          heading: 'Thesis summary',
          lines: [runtime.thesisName, thesis.brandBoundary || runtime.siteDefinition],
        },
        {
          heading: 'Audience',
          lines: formatMarkdownBullets([
            thesis.audience || runtime.audience,
            `Intent types: ${thesis.intentTypes.join(', ')}`,
          ]),
        },
        {
          heading: 'What it is really about',
          lines: formatMarkdownBullets([
            runtime.offer,
            `Primary site slug: ${runtime.siteSlug}`,
            `${relatedSites.length} active site bundle(s) currently mapped to this thesis.`,
          ]),
        },
        {
          heading: 'What it is not about',
          lines: formatMarkdownBullets([
            'Generic AI commentary without a concrete workflow or buying trigger.',
            'Building a new domain for every hot keyword without routing back to a thesis.',
          ]),
        },
        {
          heading: 'Monetization paths',
          lines: formatMarkdownBullets(runtime.monetization),
        },
        {
          heading: 'Guardrails',
          lines: formatMarkdownBullets([
            'Only promote keywords that clear Gate 1 thresholds.',
            'Keep content grounded in source, claim, and page-brief assets.',
          ]),
        },
      ],
    )
    exported.files.theses.push({ id: thesisId, thesisKey: thesis.thesisKey, path: thesisPath })
  }

  for (const site of enrichedSites) {
    const clusterId = toWikiId('cluster', site.cluster.siteSlug)
    const thesisId = toWikiId('thesis', site.cluster.thesisKey)
    const sourceItems = dedupeBy(
      [
        ...site.sourcePack.categories.official,
        ...site.sourcePack.categories.competitive,
        ...site.sourcePack.categories.community,
        ...site.sourcePack.categories.workflow,
        ...site.sourcePack.categories.serp,
      ],
      'id',
    )
    await Promise.all([
      removeWikiCardsByPrefix(
        'sources',
        `source.${site.siteSlug}.`,
        sourceItems.map((source) => `source.${site.siteSlug}.${source.id}.md`),
      ),
      removeWikiCardsByPrefix(
        'claims',
        `claim.${site.siteSlug}.`,
        site.claims.map((claim) => `claim.${site.siteSlug}.${claim.id.split('.').at(-1)}.md`),
      ),
      removeWikiCardsByPrefix(
        'pageBriefs',
        `page-brief.${site.siteSlug}.`,
        site.pageBriefs.map((brief) => `page-brief.${site.siteSlug}.${brief.pageType}.md`),
      ),
      removeWikiCardsByPrefix(
        'assets',
        `asset.${site.siteSlug}.`,
        site.conversionAssets.map((asset) => `asset.${site.siteSlug}.${asset.id.split('.').at(-1)}.md`),
      ),
    ])
    const clusterPath = await writeWikiCard(
      'clusters',
      `cluster.${site.cluster.siteSlug}.md`,
      {
        id: clusterId,
        type: 'cluster',
        thesis_id: thesisId,
        status: site.lifecycle.state === 'retire' ? 'watch' : 'active',
        primary_keyword: site.cluster.primaryKeyword,
        support_keywords: site.cluster.supportKeywords,
        intent_mix: site.research.topIntents,
        opportunity_score: site.cluster.averageScore,
        commercial_fit: round(
          site.cluster.opportunities.reduce((sum, item) => sum + item.commercialFit, 0) /
            Math.max(site.cluster.opportunities.length, 1),
          1,
        ),
        source_readiness: sourceItems.length,
        site_slug: site.cluster.siteSlug,
        target_pages: site.pages.map((page) => page.type),
      },
      [
        {
          heading: 'Why this cluster exists',
          lines: [
            `${site.cluster.primaryKeyword} is the lead keyword because it routed into ${site.cluster.label} with enough support breadth and source readiness.`,
            `Audience: ${site.cluster.audience}. Offer: ${site.cluster.offer}.`,
          ],
        },
        {
          heading: 'Search intents',
          lines: formatMarkdownBullets(site.research.topIntents),
        },
        {
          heading: 'Support page map',
          lines: formatMarkdownBullets(site.pages, (page) => `${page.type}: ${page.title}`),
        },
        {
          heading: 'Competitive gap',
          lines: formatMarkdownBullets(site.research.gapSummary.gapOpportunities),
        },
        {
          heading: 'Conversion path',
          lines: formatMarkdownBullets(site.conversionAssets, (asset) => `${asset.title} -> ${asset.conversionEvent}`),
        },
        {
          heading: 'Risks',
          lines: formatMarkdownBullets([
            ...site.cluster.opportunities.flatMap((item) => item.riskFlags ?? []),
            ...safeArray(site.audit?.issues).slice(0, 2).map((issue) => issue.message),
          ]),
        },
      ],
    )
    exported.files.clusters.push({ id: clusterId, siteSlug: site.siteSlug, path: clusterPath })

    for (const source of sourceItems) {
      const sourceId = toWikiId('source', site.siteSlug, source.id)
      const sourceFilePath = await writeWikiCard(
        'sources',
        `source.${site.siteSlug}.${source.id}.md`,
        {
          id: sourceId,
          type: 'source',
          thesis_id: thesisId,
          cluster_id: clusterId,
          source_kind: source.category,
          title: source.title,
          url: source.url,
          domain: source.domain,
          published_at: source.detectedYear != null ? `${source.detectedYear}-01-01` : null,
          captured_at: config.generatedAt,
          freshness_score: estimateFreshnessScore(source),
          credibility_score: estimateCredibilityScore(source),
          status: 'active',
        },
        [
          {
            heading: 'Source summary',
            lines: [compactText(source.snippet || source.title, 220)],
          },
          {
            heading: 'Key facts extracted',
            lines: formatMarkdownBullets([
              source.title,
              `Intent: ${source.intent}`,
              `Category: ${source.category}`,
            ]),
          },
          {
            heading: 'Buyer pain signals',
            lines: formatMarkdownBullets(
              looksLikeCommunitySource(source)
                ? [source.snippet || 'Community complaints are driving this source into the pack.']
                : ['Use this source to sharpen the evaluation or implementation angle.'],
            ),
          },
          {
            heading: 'Caveats',
            lines: formatMarkdownBullets([
              looksLikeCommunitySource(source)
                ? 'Community sources are directional; verify operational claims before publishing them as facts.'
                : 'Do not lift raw vendor claims into copy without comparison or caveat framing.',
            ]),
          },
          {
            heading: 'Refresh trigger',
            lines: formatMarkdownBullets([
              'Refresh when the detected year changes, pricing copy changes, or a fresher source outranks this result.',
            ]),
          },
        ],
      )
      exported.files.sources.push({
        id: sourceId,
        siteSlug: site.siteSlug,
        sourceKind: source.category,
        path: sourceFilePath,
      })
    }

    for (const claim of site.claims) {
      const statement = preferMeaningfulText(
        claim.statement,
        `${titleCase(claim.claimKind || 'claim')} guidance for ${site.cluster.primaryKeyword}.`,
      )
      const whyItMatters = preferMeaningfulText(
        claim.whyItMatters,
        `Use this claim to support the ${claim.decisionStage || 'discover'} decision stage for ${site.cluster.primaryKeyword}.`,
      )
      const evidence = meaningfulList(claim.evidence)
      const counterpoint = preferMeaningfulText(
        claim.counterpoint,
        'Refresh this claim when fresher pricing, workflow, or community evidence materially changes the tradeoff.',
      )
      const claimPath = await writeWikiCard(
        'claims',
        `claim.${site.siteSlug}.${claim.id.split('.').at(-1)}.md`,
        {
          id: claim.id,
          type: 'claim',
          thesis_id: claim.thesisId,
          cluster_id: claim.clusterId,
          page_types: claim.pageTypes,
          claim_kind: claim.claimKind,
          decision_stage: claim.decisionStage,
          confidence: claim.confidence,
          quality_score: preferFiniteNumber(claim.qualityScore, computeClaimQualityScore(claim)),
          freshness: claim.freshness,
          reuse_priority: claim.reusePriority ?? 'medium',
          lifecycle_decision: claim.lifecycleDecision ?? 'active',
          source_ids: claim.sourceIds.map((sourceId) => toWikiId('source', site.siteSlug, sourceId)),
          status: claim.status,
        },
        [
          {
            heading: 'Claim',
            lines: [statement],
          },
          {
            heading: 'Why it matters',
            lines: [whyItMatters],
          },
          {
            heading: 'Evidence',
            lines: formatMarkdownBullets(
              evidence.length > 0
                ? evidence
                : [
                    `${safeArray(claim.pageTypes).length} page type(s) currently reuse this claim.`,
                    `${safeArray(claim.sourceIds).length} source anchor(s) back the current version.`,
                  ],
            ),
          },
          {
            heading: 'Counterpoint / limitation',
            lines: [counterpoint],
          },
          {
            heading: 'Best page types to use this in',
            lines: formatMarkdownBullets(claim.bestPageTypes),
          },
        {
          heading: 'Reuse priority',
          lines: [claim.reusePriority ?? 'medium'],
        },
        {
          heading: 'Quality score',
          lines: [String(preferFiniteNumber(claim.qualityScore, computeClaimQualityScore(claim)))],
        },
        {
          heading: 'Performance note',
          lines: [claim.performanceNote ?? 'No performance note yet.'],
          },
          {
            heading: 'Lifecycle decision',
            lines: [claim.lifecycleDecision ?? 'active'],
          },
          {
            heading: 'Refresh condition',
            lines: [claim.refreshCondition],
          },
        ],
      )
      exported.files.claims.push({ id: claim.id, siteSlug: site.siteSlug, path: claimPath })
    }

    for (const brief of site.pageBriefs) {
      const primaryClaims = brief.primaryClaimIds
        .map((claimId) => site.claims.find((claim) => claim.id === claimId))
        .filter(Boolean)
      const secondaryClaims = brief.secondaryClaimIds
        .map((claimId) => site.claims.find((claim) => claim.id === claimId))
        .filter(Boolean)
      const refreshPlan = refreshPlanMap.get(`${site.siteSlug}/${brief.pageType}`)
      const writebackEntry = writebackQueueMap.get(`${site.siteSlug}/${brief.pageType}`)
      const briefPath = await writeWikiCard(
        'pageBriefs',
        `page-brief.${site.siteSlug}.${brief.pageType}.md`,
        {
          id: brief.id,
          type: 'page_brief',
          thesis_id: brief.thesisId,
          cluster_id: brief.clusterId,
          page_type: brief.pageType,
          target_intent: brief.targetIntent,
          target_asset: brief.targetAsset,
          primary_claim_ids: brief.primaryClaimIds,
          secondary_claim_ids: brief.secondaryClaimIds,
          required_sections: brief.requiredSections,
          cta_strategy: brief.ctaStrategy,
          review_priority: brief.reviewPriority,
          completeness_score: preferFiniteNumber(
            brief.completenessScore,
            computePageBriefCompletenessScore(brief),
          ),
        },
        [
          {
            heading: 'Page goal',
            lines: [brief.pageGoal],
          },
          {
            heading: 'Visitor intent',
            lines: [brief.visitorIntent],
          },
          {
            heading: 'Must-win questions',
            lines: formatMarkdownBullets(brief.mustWinQuestions),
          },
          {
            heading: 'Required claims',
            lines: formatMarkdownBullets(primaryClaims, (claim) => claim.statement),
          },
          {
            heading: 'Required examples',
            lines: formatMarkdownBullets(brief.requiredExamples),
          },
          {
            heading: 'Required caveats',
            lines: formatMarkdownBullets(brief.requiredCaveats),
          },
          {
            heading: 'CTA strategy',
            lines: [`${brief.ctaStrategy} -> ${brief.targetAsset}`],
          },
        {
          heading: 'Failure conditions',
          lines: formatMarkdownBullets(brief.failureConditions),
        },
        {
          heading: 'Completeness score',
          lines: [String(preferFiniteNumber(brief.completenessScore, computePageBriefCompletenessScore(brief)))],
        },
        {
          heading: 'Refresh targets',
          lines: formatMarkdownBullets(
            refreshPlan?.refreshTargets?.length > 0
              ? refreshPlan.refreshTargets
                : ['Refresh when new source-pack evidence or search feedback changes the page logic.'],
            ),
          },
          {
            heading: 'Refresh triggers',
            lines: formatMarkdownBullets(
              refreshPlan?.refreshTriggers?.length > 0
                ? refreshPlan.refreshTriggers
                : ['No explicit refresh trigger recorded yet.'],
            ),
          },
          {
            heading: 'Optimization writeback',
            lines: formatMarkdownBullets([
              writebackEntry?.nextRewriteGoal ?? 'No next rewrite goal recorded yet.',
              ...(safeArray(writebackEntry?.writebackTargets).length > 0
                ? writebackEntry.writebackTargets
                : ['No writeback targets recorded yet.']),
            ]),
          },
        ],
      )
      exported.files.pageBriefs.push({ id: brief.id, siteSlug: site.siteSlug, path: briefPath })
    }

    for (const asset of site.conversionAssets) {
      const assetPerformance = assetPerformanceMap.get(`${site.siteSlug}/${asset.slug}`)
      const assetPath = await writeWikiCard(
        'assets',
        `asset.${site.siteSlug}.${asset.id.split('.').at(-1)}.md`,
        {
          id: asset.id,
          type: 'conversion_asset',
          thesis_id: asset.thesisId,
          asset_kind: asset.assetKind,
          status: asset.status,
          intent_stage: asset.intentStage,
          delivery_mode: asset.deliveryMode,
          primary_pages: asset.primaryPages,
          conversion_event: asset.conversionEvent,
          click_event: asset.clickEvent,
          form_event: asset.formEvent,
          delivery_event: asset.deliveryEvent,
          refresh_cycle: asset.refreshCycle,
          refresh_priority: asset.refreshPriority ?? 'medium',
          reuse_score: preferFiniteNumber(asset.reuseScore, computeAssetReuseScore(asset)),
          acceptance_mode: asset.acceptance?.acceptanceMode ?? '',
          acceptance_status: asset.acceptance?.acceptanceStatus ?? '',
          accepted_version: asset.acceptance?.acceptedVersion ?? '',
          landing_path: asset.landingPath,
          thank_you_path: asset.thankYouPath,
          download_path: asset.downloadPath,
        },
        [
          {
            heading: 'Asset promise',
            lines: [asset.promise],
          },
          {
            heading: 'Who it is for',
            lines: [site.cluster.audience],
          },
          {
            heading: 'What the visitor receives',
            lines: formatMarkdownBullets(
              asset.deliverables?.length > 0 ? asset.deliverables : [{ label: asset.title, detail: asset.summary }],
              (item) => `${item.label}: ${item.detail}`,
            ),
          },
          {
            heading: 'Why it converts',
            lines: [`It gives the visitor a concrete next step from ${asset.primaryPages.join(', ') || 'the site hub'}.`],
          },
          {
            heading: 'Best-fit use cases',
            lines: formatMarkdownBullets(asset.useCaseLabels?.length > 0 ? asset.useCaseLabels : ['No explicit use-case mapping yet.']),
          },
          {
            heading: 'Strongest use case',
            lines: [asset.strongestUseCase || 'No strongest use-case note yet.'],
          },
          {
            heading: 'Best page types',
            lines: formatMarkdownBullets(asset.bestPageTypes?.length > 0 ? asset.bestPageTypes : asset.primaryPages),
          },
          {
            heading: 'Placement rules',
            lines: formatMarkdownBullets(asset.primaryPages.length > 0 ? asset.primaryPages : ['hub']),
          },
          {
            heading: 'Delivery rules',
            lines: formatMarkdownBullets([
              `Landing page: ${asset.landingPath}`,
              `Thank-you page: ${asset.thankYouPath}`,
              `Download file: ${asset.downloadPath}`,
              `Track ${asset.clickEvent}, ${asset.formEvent}, ${asset.conversionEvent}, and ${asset.deliveryEvent} in GA4.`,
              `Refresh on a ${asset.refreshCycle} cycle or when the workflow changes.`,
            ]),
          },
          {
            heading: 'Acceptance mode',
            lines: [asset.acceptance?.acceptanceMode ?? 'Not evaluated'],
          },
          {
            heading: 'Acceptance status',
            lines: [asset.acceptance?.acceptanceStatus ?? asset.acceptance?.gateStatus ?? 'Not evaluated'],
          },
          {
            heading: 'Conversion quality note',
            lines: [asset.conversionQualityNote || 'No conversion quality note yet.'],
          },
          {
            heading: 'Last human review note',
            lines: [asset.acceptance?.lastHumanReviewNote ?? 'No human review note yet.'],
          },
        {
          heading: 'Refresh priority',
          lines: [asset.refreshPriority ?? 'medium'],
        },
        {
          heading: 'Reuse score',
          lines: [String(preferFiniteNumber(asset.reuseScore, computeAssetReuseScore(asset)))],
        },
        {
          heading: 'Asset performance view',
          lines: formatMarkdownBullets(
            assetPerformance
                ? [
                    `Strongest path: ${assetPerformance.strongestPath}`,
                    `Submit rate: ${toPercentString(assetPerformance.modeledSubmitRate)}`,
                    `Delivery rate: ${toPercentString(assetPerformance.modeledDeliveryRate)}`,
                    `Deeper action rate: ${toPercentString(assetPerformance.modeledDeeperActionRate)}`,
                    assetPerformance.note,
                  ]
                : ['No asset performance row exported yet.'],
            ),
          },
        ],
      )
      exported.files.assets.push({ id: asset.id, siteSlug: site.siteSlug, path: assetPath })
    }

    const reviewFinding = `Gate 2 is ${site.gates.publish.status}; Gate 3 is ${site.gates.expansion.day30.status}; lifecycle is ${site.lifecycle.state}.`
    const reviewId = toWikiId('review', site.siteSlug, shortHash(currentRunSnapshot.runId, 8))
    const reviewPath = await writeWikiCard(
      'reviews',
      `review.${site.siteSlug}.${shortHash(currentRunSnapshot.runId, 8)}.md`,
      {
        id: reviewId,
        type: 'review',
        target_id: clusterId,
        target_type: 'cluster',
        signal_source: `${site.monitoring.rankingSource}+${site.monitoring.conversionSource}`,
        finding: reviewFinding,
        decision: site.lifecycle.state,
        action: site.lifecycle.nextMove,
        owner: 'pipeline',
        created_at: config.generatedAt,
      },
      [
        {
          heading: 'What happened',
          lines: [reviewFinding],
        },
        {
          heading: 'Signal observed',
          lines: formatMarkdownBullets([
            `${site.monitoring.impressions} impressions / ${toPercentString(site.monitoring.ctr)} CTR / avg position ${site.monitoring.avgPosition}`,
            `${site.monitoring.conversions} conversions / $${round(site.monitoring.revenue, 2)} revenue proxy`,
          ]),
        },
        {
          heading: 'Why it matters',
          lines: [site.lifecycle.reason],
        },
        {
          heading: 'Decision',
          lines: [site.lifecycle.state],
        },
        {
          heading: 'Next run change',
          lines: formatMarkdownBullets(site.optimization.map((item) => `${item.priority}: ${item.title}`)),
        },
      ],
    )
    exported.files.reviews.push({ id: reviewId, siteSlug: site.siteSlug, path: reviewPath })

    const experimentCards = []
    for (const action of site.optimization.filter((item) => item.priority !== 'low').slice(0, 3)) {
      const experimentId = toWikiId('experiment', site.siteSlug, action.title)
      const experimentPath = await writeWikiCard(
        'experiments',
        `experiment.${site.siteSlug}.${slugify(action.title)}.md`,
        {
          id: experimentId,
          type: 'experiment',
          target_id: clusterId,
          target_type: 'cluster',
          signal_source: 'optimization',
          finding: action.title,
          decision: 'test',
          action: action.reason,
          owner: 'pipeline',
          created_at: config.generatedAt,
        },
        [
          {
            heading: 'What happened',
            lines: [action.title],
          },
          {
            heading: 'Signal observed',
            lines: [action.reason],
          },
          {
            heading: 'Why it matters',
            lines: [site.lifecycle.reason],
          },
          {
            heading: 'Decision',
            lines: ['Run this as the next optimization experiment.'],
          },
          {
            heading: 'Next run change',
            lines: formatMarkdownBullets([
              `Apply to pages: ${site.pages.slice(0, 3).map((page) => page.slug).join(', ') || 'hub'}`,
              `Primary claim anchor: ${site.claims[0]?.statement ?? 'Refresh claim library first.'}`,
            ]),
          },
        ],
      )
      experimentCards.push({ id: experimentId, path: experimentPath, title: action.title })
      exported.files.experiments.push({ id: experimentId, siteSlug: site.siteSlug, path: experimentPath })
    }

    exported.sites.push(
      pickDefined({
        siteSlug: site.siteSlug,
        thesisKey: site.cluster.thesisKey,
        clusterId,
        reviewId,
        dossierPath: `/generated/content-artifacts/${site.siteSlug}/research-dossier.json`,
        claimCount: site.claims.length,
        pageBriefCount: site.pageBriefs.length,
        assetCount: site.conversionAssets.length,
        sourceCount: sourceItems.length,
        experimentCount: experimentCards.length,
      }),
    )
  }

  exported.counts = Object.fromEntries(
    Object.entries(exported.files).map(([key, value]) => [key, value.length]),
  )
  exported.routing = routingSummary
  exported.feedback = {
    generatedAt: contentFeedback.generatedAt,
    siteRecommendations: contentFeedback.siteRecommendations.length,
    pageTypeSignals: contentFeedback.pageTypeSignals.length,
  }
  exported.playbook = {
    generatedAt: contentPlaybook.generatedAt,
    siteRules: contentPlaybook.siteRules.length,
    pageTypeRules: contentPlaybook.pageTypeRules.length,
    manualPatterns: contentPlaybook.manualPatterns.length,
  }
  if (phase2ExpansionTrigger) {
    exported.phase2 = {
      status: phase2ExpansionTrigger.status,
      allowSecondThesis: phase2ExpansionTrigger.allowSecondThesis,
      allowMorePages: phase2ExpansionTrigger.allowMorePages,
    }
  }

  await writeJson(path.join(generatedDir, 'wiki-index.json'), exported)
  await writeMarkdown(
    path.join(wikiRoot, 'README.md'),
    [
      '# Hermes Wiki Export',
      '',
      `Generated at ${config.generatedAt}.`,
      '',
      `- theses: ${exported.counts.theses}`,
      `- clusters: ${exported.counts.clusters}`,
      `- sources: ${exported.counts.sources}`,
      `- claims: ${exported.counts.claims}`,
      `- page briefs: ${exported.counts.pageBriefs}`,
      `- assets: ${exported.counts.assets}`,
      `- reviews: ${exported.counts.reviews}`,
      `- experiments: ${exported.counts.experiments}`,
      '',
      'This directory is the canonical content-asset store for thesis, cluster, source, claim, brief, asset, and review cards.',
      'Runtime artifacts still live under public/generated and storage/.',
      '',
    ].join('\n'),
  )

  return exported
}

async function runPipeline() {
  await ensureDirectories()
  const reviewOverrideIndex = buildReviewOverrideIndex(await readJsonIfExists(reviewOverridesPath))
  const previousHistory = (await readJsonIfExists(historyPath)) ?? []
  const previousFeedback = await readJsonIfExists(feedbackPath)
  const previousPlaybook = await readJsonIfExists(contentPlaybookPath)
  const activeContentPlaybook = buildContentPlaybook(
    previousFeedback,
    previousHistory,
    reviewOverrideIndex,
    previousPlaybook,
  )
  const activeContentPlaybookIndex = buildContentPlaybookIndex(activeContentPlaybook)

  const discoveredTopicInputs = dedupe(
    [...seedTopics, ...(await fetchTrendTopics())].map((topic) => JSON.stringify(topic)),
  ).map((topic) => JSON.parse(topic))
  const discoveredTopics = []
  for (const topic of discoveredTopicInputs) {
    discoveredTopics.push(await enrichTopicWithLiveSignals(topic))
  }

  const rawOpportunities = discoveredTopics.map((topic, index) =>
    buildRawOpportunity(topic, index),
  )
  const validatedOpportunities = rawOpportunities.map(validateOpportunity)
  const routedOpportunities = validatedOpportunities.map((opportunity) => ({
    ...opportunity,
    routing: routeOpportunity(opportunity),
  }))
  const approved = routedOpportunities.filter((item) => item.status === 'approved')
  const watchlist = routedOpportunities.filter((item) => item.status === 'watch')
  const rejected = routedOpportunities.filter((item) => item.status === 'rejected')
  const routingSummary = buildRoutingSummary(routedOpportunities)
  const clusters = clusterApprovedOpportunities(routedOpportunities)

  const sites = []
  const publishGateBySiteSlug = new Map()

  for (const cluster of clusters) {
    const siteDir = path.join(sitesRoot, cluster.siteSlug)
    const siteArtifactsDir = path.join(artifactsDir, cluster.siteSlug)
    const factsDir = path.join(siteArtifactsDir, 'facts')
    await mkdir(siteDir, { recursive: true })
    await mkdir(factsDir, { recursive: true })

    const research = await fetchPublishResearch(cluster.primaryKeyword)
    const sourcePack = await buildSourcePack(cluster, research)
    const wikiSeed = await loadWikiSeedBundle(cluster)
    await writeJson(path.join(siteArtifactsDir, 'source-pack.json'), sourcePack)
    const pagePlanning = await buildPageModels(
      cluster,
      research,
      sourcePack,
      reviewOverrideIndex,
      activeContentPlaybookIndex,
      wikiSeed,
    )
    await writeJson(path.join(siteArtifactsDir, 'research-dossier.json'), pagePlanning.researchDossier)
    const siteVisualBundle = await buildSiteVisualAssets({
      baseUrl: config.baseUrl,
      siteDir,
      siteArtifactsDir,
      cluster,
      pages: pagePlanning.pages,
      conversionAssets: pagePlanning.conversionAssets,
    })
    const pageModels = pagePlanning.pages.map((page) => ({
      ...page,
      visualAsset: siteVisualBundle.pageVisuals[page.slug] ?? null,
    }))
    const conversionAssets = pagePlanning.conversionAssets.map((asset) => ({
      ...asset,
      visualAsset: siteVisualBundle.assetVisuals[asset.slug] ?? null,
    }))
    const siteRecord = {
      siteSlug: cluster.siteSlug,
      siteName: cluster.thesisName,
      cluster,
      research,
      sourcePack,
      claims: pagePlanning.claims,
      pageBriefs: pagePlanning.pageBriefs,
      researchDossier: pagePlanning.researchDossier,
      conversionAssets,
      visualAssets: siteVisualBundle.manifest,
      homePath: `/generated-sites/${cluster.siteSlug}/index.html`,
      outputDir: siteDir,
      pages: pageModels,
      pageArtifacts: [],
      audit: null,
    }

    const renderedPages = []

    for (const page of pageModels) {
      await writeJson(path.join(factsDir, `${page.fileName.replace(/\.html$/, '')}.json`), page)
      const rendered = renderSiteHtml(siteRecord, page)
      const pageOutput = {
        ...page,
        canonicalUrl: rendered.canonicalUrl,
        titleLength: rendered.titleLength,
        descriptionLength: rendered.descriptionLength,
        wordCount: rendered.wordCount,
        html: rendered.html,
      }
      renderedPages.push(pageOutput)
      await writeFile(path.join(siteDir, page.fileName), `${rendered.html}\n`)
    }

    const summary = buildSiteSummary(cluster, renderedPages)
    siteRecord.audit = {
      score: summary.auditScore,
      status: summary.auditStatus,
      issues: summary.auditIssues,
      antiGeneric: summary.antiGeneric,
    }
    siteRecord.pageArtifacts = renderedPages.map(({ html, ...page }) => page)
    const publishGate = evaluatePublishGate(siteRecord)
    publishGateBySiteSlug.set(siteRecord.siteSlug, publishGate)

    if (publishGate.status !== 'pass') {
      for (const page of renderedPages) {
        page.html = applyNoindexDirective(page.html)
        await writeFile(path.join(siteDir, page.fileName), `${page.html}\n`)
      }
    }

    const downloadsDir = path.join(siteDir, 'downloads')
    await mkdir(downloadsDir, { recursive: true })
    const assetArtifacts = []
    const consultOffer = buildConsultOfferRecord(siteRecord)

    for (const asset of siteRecord.conversionAssets) {
      await writeMarkdown(path.join(downloadsDir, asset.downloadFileName), asset.downloadMarkdown)
      const landingPage = renderAssetLandingHtml(siteRecord, asset)
      const thankYouPage = renderAssetThankYouHtml(siteRecord, asset)
      const landingHtml =
        publishGate.status === 'pass' ? landingPage.html : applyNoindexDirective(landingPage.html)
      const thankYouHtml =
        publishGate.status === 'pass'
          ? thankYouPage.html
          : applyNoindexDirective(thankYouPage.html)

      await writeFile(path.join(siteDir, asset.landingFileName), `${landingHtml}\n`)
      await writeFile(path.join(siteDir, asset.thankYouFileName), `${thankYouHtml}\n`)

      assetArtifacts.push({
        slug: asset.slug,
        title: asset.title,
        landingPath: asset.landingPath,
        thankYouPath: asset.thankYouPath,
        downloadPath: asset.downloadPath,
        visualAssetPath: asset.visualAsset?.url ?? '',
        visualAssetStatus: asset.visualAsset?.mode ?? 'none',
      })
    }

    siteRecord.assetArtifacts = assetArtifacts
    const consultLandingPage = renderConsultOfferHtml(siteRecord, consultOffer)
    const consultThankYouPage = renderConsultThankYouHtml(siteRecord, consultOffer)
    const consultLandingHtml =
      publishGate.status === 'pass'
        ? consultLandingPage.html
        : applyNoindexDirective(consultLandingPage.html)
    const consultThankYouHtml =
      publishGate.status === 'pass'
        ? consultThankYouPage.html
        : applyNoindexDirective(consultThankYouPage.html)
    await writeFile(path.join(siteDir, consultOffer.landingFileName), `${consultLandingHtml}\n`)
    await writeFile(path.join(siteDir, consultOffer.thankYouFileName), `${consultThankYouHtml}\n`)
    siteRecord.commercialOffer = consultOffer

    siteRecord.pages = renderedPages.map((page) => ({
      slug: page.slug,
      navLabel: page.navLabel,
      type: page.type,
      path: page.path,
      canonicalUrl: page.canonicalUrl,
      title: page.title,
      metaDescription: page.metaDescription,
      wordCount: page.wordCount,
      internalLinkCount: page.internalLinks.length,
      coveredIntents: page.coveredIntents,
      originalAnchors: page.originalAnchors,
      draftEngine: page.draftEngine,
      ctaHref: page.ctaHref,
      ctaEvent: page.ctaEvent,
      contentStats: page.contentStats,
      reviewSignals: page.reviewSignals,
      sourceReferenceCount: page.sourceReferences?.length ?? 0,
      materialSlotCount: page.materialSlots?.length ?? 0,
      commercialModuleCount: page.commercialModules?.length ?? 0,
      visualAssetPath: page.visualAsset?.url ?? '',
      visualAssetStatus: page.visualAsset?.mode ?? 'none',
      indexingDirective: publishGate.status === 'pass' ? 'index' : 'noindex',
    }))
    sites.push(siteRecord)
  }

  await writeFile(path.join(sitesRoot, 'index.html'), buildSiteIndexHtml(sites))

  const deploymentSites = sites.map((site) =>
    buildDeploymentSite(
      site,
      site.audit.status,
      publishGateBySiteSlug.get(site.siteSlug) ?? evaluatePublishGate(site),
    ),
  )

  const seoReport = buildSeoReport(sites, publishGateBySiteSlug)
  const sitemapXml = buildSitemapXml(seoReport.queuedUrls)
  const robotsTxt = buildRobotsTxt()
  const llmsTxt = buildLlmsTxt(
    sites.filter((site) => publishGateBySiteSlug.get(site.siteSlug)?.status === 'pass'),
  )
  const primaryReleaseSite =
    sites.find((site) => publishGateBySiteSlug.get(site.siteSlug)?.status === 'pass') ?? sites[0] ?? null

  await writeFile(path.join(publicDir, 'index.html'), buildRootIndexHtml(primaryReleaseSite))
  await writeFile(path.join(publicDir, 'sitemap.xml'), sitemapXml)
  await writeFile(path.join(publicDir, 'robots.txt'), robotsTxt)
  await writeFile(path.join(publicDir, 'llms.txt'), llmsTxt)

  const currentRunNumber = previousHistory.length + 1
  const previousRun = previousHistory.at(-1) ?? null

  const currentMonitoringSites = await Promise.all(
    sites.map((site) => {
      const previousMetrics = previousRun?.sites?.find(
        (item) => item.siteSlug === site.siteSlug,
      )
      return buildCurrentMetrics(site, currentRunNumber, previousMetrics)
    }),
  )

  const currentMonitoringMode = dedupe(currentMonitoringSites.map((site) => site.mode)).join(', ')

  const seededBaseline =
    previousHistory.length === 0
      ? {
          runId: 'seed-baseline',
          generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
          mode: currentMonitoringMode || config.monitoringMode,
          seeded: true,
          sites: currentMonitoringSites.map((site) => ({
            ...site,
            impressions: Math.round(site.impressions * 0.72),
            clicks: Math.round(site.clicks * 0.68),
            avgPosition: round(site.avgPosition + 2.8, 1),
            conversions: Math.max(1, Math.round(site.conversions * 0.6)),
            conversionRate: round(site.conversionRate * 0.86, 4),
            revenue: round(site.revenue * 0.62, 2),
            deltaFromPrevious: null,
          })),
        }
      : null

  const history = [...previousHistory]
  if (seededBaseline) history.push(seededBaseline)

  const currentRunSnapshot = {
    runId: config.runId,
    generatedAt: config.generatedAt,
    mode: currentMonitoringMode || config.monitoringMode,
    seeded: false,
    sites: currentMonitoringSites,
  }
  history.push(currentRunSnapshot)
  await writeJson(historyPath, history)

  const siteMonitoringMap = new Map(
    currentMonitoringSites.map((item) => [item.siteSlug, item]),
  )

  const enrichedSites = sites.map((site) => {
    const monitoring = siteMonitoringMap.get(site.siteSlug)
    const siteHistory = buildSiteHistory(history, site.siteSlug)
    const opportunityStatuses = site.cluster.opportunities.map((item) => item.opportunityGate.status)
    const opportunityGate = {
      status: opportunityStatuses.every((status) => status === 'pass')
        ? 'pass'
        : opportunityStatuses.some((status) => status === 'watch')
          ? 'watch'
          : 'fail',
      approvedTopics: site.cluster.opportunities.length,
      evidence: site.cluster.opportunities.map((item) => ({
        keyword: item.keyword,
        status: item.opportunityGate.status,
        trendPass: item.opportunityGate.trendPass,
        commercialPass: item.opportunityGate.commercialPass,
        supportPass: item.opportunityGate.supportPass,
        githubTopStars: item.liveSignals?.github?.topStars ?? 0,
        githubRecentRepos30d: item.liveSignals?.github?.recentRepoCount30d ?? 0,
        hackerNewsDiscussionCount30d: item.liveSignals?.hackerNews?.discussionCount30d ?? 0,
        huggingFaceMatches: item.liveSignals?.huggingFace?.modelCount ?? 0,
        serpCommercialResults: item.liveSignals?.serp?.commercialResultCount ?? 0,
        serpProductResults: item.liveSignals?.serp?.productResultCount ?? 0,
      })),
    }
    const publishGate = publishGateBySiteSlug.get(site.siteSlug) ?? evaluatePublishGate(site)
    const expansionGate = evaluateExpansionGate(site, monitoring, siteHistory)
    const optimization = deriveOptimization(site, monitoring, expansionGate)
    const lifecycle = deriveLifecycle(site, monitoring, expansionGate)

    return {
      ...site,
      deployment: deploymentSites.find((item) => item.siteSlug === site.siteSlug),
      gates: {
        opportunity: opportunityGate,
        publish: publishGate,
        expansion: expansionGate,
      },
      monitoring,
      monitoringHistory: siteHistory,
      optimization,
      lifecycle,
    }
  })
  const decisionRows = buildDecisionRows(enrichedSites)
  await writeFile(decisionLogPath, buildDecisionMarkdown(decisionRows))
  const reviewQueue = buildReviewQueue(enrichedSites)
  const assetReviewQueue = buildAssetReviewQueue(enrichedSites)
  await writeJson(reviewQueuePath, {
    generatedAt: config.generatedAt,
    reviewMode: contentConfig.reviewMode,
    unattendedMode: contentConfig.unattendedMode,
    entries: reviewQueue,
  })
  await writeMarkdown(reviewQueueMarkdownPath, buildReviewQueueMarkdown(reviewQueue))
  await writeJson(assetReviewQueuePath, {
    generatedAt: config.generatedAt,
    entries: assetReviewQueue,
  })
  await writeMarkdown(assetReviewQueueMarkdownPath, buildAssetReviewQueueMarkdown(assetReviewQueue))
  await writeJson(reviewOverridesTemplatePath, buildReviewOverrideTemplate(enrichedSites))
  const contentFeedback = buildContentFeedback(enrichedSites, history)
  await writeJson(feedbackPath, contentFeedback)
  const contentPlaybook = buildContentPlaybook(
    contentFeedback,
    history,
    reviewOverrideIndex,
    activeContentPlaybook,
  )
  await writeJson(contentPlaybookPath, contentPlaybook)
  const seoQueues = buildSeoQueues(enrichedSites, seoReport)
  const pageRefreshPlans = buildPageRefreshPlans(enrichedSites, seoQueues)
  const sourceRefreshQueue = buildSourceRefreshQueue(enrichedSites)
  const commercialIntentModel = buildCommercialIntentModel(enrichedSites)
  const commercialOpsSnapshot = await readJsonIfExists(path.join(storageDir, 'commercial-ops.json'))
  const assetPerformanceView = buildAssetPerformanceView(enrichedSites, commercialOpsSnapshot)
  const wikiWritebackQueue = buildWikiWritebackQueue(
    enrichedSites,
    pageRefreshPlans,
    assetPerformanceView,
  )
  const primaryPhase1Site =
    enrichedSites.find((site) => site.siteSlug === experiment.siteSlug) ?? enrichedSites[0] ?? null
  const phase1Validation = buildPhase1RevenueValidation(primaryPhase1Site, null)
  const phase2ExpansionTrigger = primaryPhase1Site
    ? buildPhase2ExpansionTrigger(
        primaryPhase1Site,
        phase1Validation,
        assetPerformanceView,
        commercialIntentModel,
      )
    : null
  const autoRelease = await maybeRunAutoRelease(primaryReleaseSite)
  const wikiExport = await exportWikiAssets({
    thesisRegistry,
    enrichedSites,
    routingSummary,
    contentFeedback,
    contentPlaybook,
    pageRefreshPlans,
    wikiWritebackQueue,
    assetPerformanceView,
    phase2ExpansionTrigger,
    currentRunSnapshot,
  })
  await writeJson(path.join(generatedDir, 'phase1-validation.json'), phase1Validation)
  await writeMarkdown(
    path.join(storageDir, 'phase1-validation.md'),
    buildPhase1ValidationMarkdown(phase1Validation),
  )
  await writeJson(path.join(generatedDir, 'page-refresh-plans.json'), {
    generatedAt: config.generatedAt,
    entries: pageRefreshPlans,
  })
  await writeMarkdown(
    path.join(storageDir, 'page-refresh-plans.md'),
    buildPageRefreshPlansMarkdown(pageRefreshPlans),
  )
  await writeJson(path.join(generatedDir, 'source-refresh-queue.json'), {
    generatedAt: config.generatedAt,
    entries: sourceRefreshQueue,
  })
  await writeMarkdown(
    path.join(storageDir, 'source-refresh-queue.md'),
    buildSourceRefreshQueueMarkdown(sourceRefreshQueue),
  )
  await writeJson(path.join(generatedDir, 'commercial-intent.json'), commercialIntentModel)
  await writeJson(path.join(generatedDir, 'asset-performance.json'), assetPerformanceView)
  await writeMarkdown(
    path.join(storageDir, 'asset-performance.md'),
    buildAssetPerformanceMarkdown(assetPerformanceView),
  )
  await writeJson(path.join(generatedDir, 'wiki-writeback-queue.json'), {
    generatedAt: config.generatedAt,
    entries: wikiWritebackQueue,
  })
  await writeMarkdown(
    path.join(storageDir, 'wiki-writeback-queue.md'),
    buildWikiWritebackMarkdown(wikiWritebackQueue),
  )
  if (phase2ExpansionTrigger) {
    await writeJson(path.join(generatedDir, 'phase2-expansion-trigger.json'), phase2ExpansionTrigger)
    await writeMarkdown(
      path.join(storageDir, 'phase2-expansion-trigger.md'),
      buildPhase2ExpansionMarkdown(phase2ExpansionTrigger),
    )
  }

  const stageResults = [
    {
      key: 'trend-discovery',
      label: '热词发现',
      status: 'completed',
      summary: `${rawOpportunities.length} 个原始热词进入本轮候选池`,
      detail: `本轮只抓取与 ${experiment.thesisName} 相关的主题，避免 thesis 漂移。`,
      metrics: {
        discovered: rawOpportunities.length,
        sources: dedupe(rawOpportunities.map((item) => item.source)).length,
        liveSources:
          dedupe(
            discoveredTopics.flatMap((topic) =>
              Object.entries(topic.liveSignals ?? {})
                .filter(([, value]) => value.status === 'live')
                .map(([key]) => key),
            ),
          ).length,
      },
    },
    {
      key: 'validation-screening',
      label: '验证筛选',
      status: approved.length > 0 ? 'completed' : 'attention',
      summary: `${approved.length} 个通过，${watchlist.length} 个观察，${rejected.length} 个淘汰`,
      detail: '机会批准关已经生效：趋势连续性、商业意图和支持页广度都要过线。',
      metrics: {
        approved: approved.length,
        watch: watchlist.length,
        rejected: rejected.length,
      },
    },
    {
      key: 'keyword-clustering',
      label: '关键词聚类',
      status: clusters.length > 0 ? 'completed' : 'attention',
      summary: `${clusters.length} 个站点簇已生成`,
      detail: '每个热词会先经过 thesis -> 域名 路由；只有 append_existing 的机会才会被聚成站点簇，candidate 会留在候选池里继续观察。',
      metrics: {
        clusters: clusters.length,
        appendExisting: routingSummary.appendExistingCount,
        thesisCandidates: routingSummary.createCandidateCount,
        deferred: routingSummary.rejectOrWatchCount,
        trackedKeywords: clusters.reduce((sum, cluster) => sum + cluster.trackedKeywords.length, 0),
      },
    },
    {
      key: 'content-generation',
      label: '内容生成',
      status: 'completed',
      summary: `${enrichedSites.length} 个站点蓝图、${enrichedSites.reduce((sum, site) => sum + site.pages.length, 0)} 个页面内容计划、${wikiExport.counts.claims} 张 claim 卡已生成`,
      detail: '内容生成已经切到 source-pack -> research dossier -> claim / page brief -> page facts -> HTML 的证据驱动模式，支持扩展页型和无人值守发布。',
      metrics: {
        sites: enrichedSites.length,
        pages: enrichedSites.reduce((sum, site) => sum + site.pages.length, 0),
        claims: wikiExport.counts.claims,
        pageBriefs: wikiExport.counts.pageBriefs,
      },
    },
    {
      key: 'page-construction',
      label: '页面构建',
      status: 'completed',
      summary: `${enrichedSites.reduce((sum, site) => sum + site.pages.length, 0)} 个静态页面已写入 public/generated-sites`,
      detail: '每个站点都生成了可访问的 HTML 页面和集群首页。',
      metrics: {
        pageCount: enrichedSites.reduce((sum, site) => sum + site.pages.length, 0),
        siteCount: enrichedSites.length,
      },
    },
    {
      key: 'quality-audit',
      label: '质量审核',
      status: enrichedSites.some((site) => site.audit.status === 'attention') ? 'attention' : 'completed',
      summary: `平均审核分 ${round(enrichedSites.reduce((sum, site) => sum + site.audit.score, 0) / Math.max(enrichedSites.length, 1))}`,
      detail: '发布关现在同时检查信息差、回答完整性、非模板化、事实密度、verdict、example、traceability 和审校队列。',
      metrics: {
        warningSites: enrichedSites.filter((site) => site.audit.status !== 'pass').length,
        openIssues: enrichedSites.reduce((sum, site) => sum + site.audit.issues.length, 0),
      },
    },
    {
      key: 'deployment',
      label: '部署上线',
      status: 'completed',
      summary: `${deploymentSites.filter((site) => site.releaseMode === 'release-ready').length} 个站点可进入 release-ready，${deploymentSites.filter((site) => site.releaseMode === 'preview-only').length} 个站点保持 preview-only`,
      detail:
        '本地预览始终可用；只有通过 Gate 2 的站点才会继续走生产部署适配器。',
      metrics: {
        localPreview: enrichedSites.length,
        configuredProviders: deploymentSites
          .flatMap((site) => site.providers)
          .filter((provider) => provider.status === 'configured').length,
        previewOnlySites: deploymentSites.filter((site) => site.releaseMode === 'preview-only').length,
      },
    },
    {
      key: 'seo-submission',
      label: 'SEO提交',
      status: isLocalBaseUrl(config.baseUrl) ? 'prepared' : 'completed',
      summary: `sitemap、robots 和 llms.txt 已生成，${seoReport.queuedUrls.length} 个 URL 可提交，${seoReport.blockedUrls.length} 个 URL 被 Gate 2 暂停`,
      detail: isLocalBaseUrl(config.baseUrl)
        ? '当前 base URL 是本地地址，所以提交队列已准备好，但没有向搜索引擎实际推送。'
        : 'SEO 资产已生成，只有通过 Gate 2 的页面才会继续接入真实提交客户端。',
      metrics: {
        queuedUrls: seoReport.queuedUrls.length,
        blockedUrls: seoReport.blockedUrls.length,
        liveReadyEngines: seoReport.engines.filter((engine) => engine.status === 'configured').length,
      },
    },
    {
      key: 'data-monitoring',
      label: '数据监控',
      status: 'completed',
      summary: `已写入 ${history.length} 次运行快照，${currentMonitoringSites.filter((site) => site.rankingSource === 'gsc').length}/${currentMonitoringSites.length} 个站点使用 GSC 排名，${currentMonitoringSites.filter((site) => site.conversionSource === 'ga4').length}/${currentMonitoringSites.length} 个站点使用 GA4 转化`,
      detail: 'Gate 3 会优先读取 GSC 的真实排名和 GA4 的真实转化信号；缺配置或请求失败时才回退到本地 forecast。',
      metrics: {
        historyRuns: history.length,
        totalImpressions: currentMonitoringSites.reduce((sum, site) => sum + site.impressions, 0),
        liveRankingSites: currentMonitoringSites.filter((site) => site.rankingSource === 'gsc').length,
        liveConversionSites: currentMonitoringSites.filter((site) => site.conversionSource === 'ga4').length,
      },
    },
    {
      key: 'ranking-optimization',
      label: '排名/转化优化',
      status: 'completed',
      summary: `${enrichedSites.reduce((sum, site) => sum + site.optimization.length, 0)} 条优化动作已生成`,
      detail: '第 14 天先看索引、CTR 和 top-50 信号，第 30 天再结合 top-20 信号、商业转化和连续检查点走势决定扩、投、优还是停。',
      metrics: {
        actions: enrichedSites.reduce((sum, site) => sum + site.optimization.length, 0),
        highPriority: enrichedSites.flatMap((site) => site.optimization).filter((action) => action.priority === 'high').length,
      },
    },
    {
      key: 'retirement-expansion',
      label: '淘汰/扩展',
      status: 'completed',
      summary: `${enrichedSites.filter((site) => site.lifecycle.state === 'expand').length} 个建议扩展，${enrichedSites.filter((site) => site.lifecycle.state === 'retire').length} 个建议淘汰`,
      detail: '扩展关按索引、CTR、排名信号、商业转化和连续检查点动量来做 14 天 / 30 天判断。',
      metrics: {
        expand: enrichedSites.filter((site) => site.lifecycle.state === 'expand').length,
        maintain: enrichedSites.filter((site) => site.lifecycle.state === 'maintain').length,
        watch: enrichedSites.filter((site) => site.lifecycle.state === 'watch').length,
        retire: enrichedSites.filter((site) => site.lifecycle.state === 'retire').length,
      },
    },
  ]

  const pipelineReport = {
    runId: config.runId,
    generatedAt: config.generatedAt,
    baseUrl: config.baseUrl,
    experiment: {
      thesisKey: experiment.thesisKey,
      thesisLabel: experiment.thesisLabel,
      thesisName: experiment.thesisName,
      siteDefinition: experiment.siteDefinition,
      targetAudience: experiment.targetAudience,
      offer: experiment.offer,
      monetization: experiment.monetization,
      leadMagnet: experiment.leadMagnet,
      conversionAsset: experiment.conversionAsset,
      pageTemplates: experiment.pageTemplates,
    },
    config: {
      minOpportunityScore: config.minOpportunityScore,
      minCommercialFit: config.minCommercialFit,
      maxSitesPerRun: config.maxSitesPerRun,
      monitoringMode: config.monitoringMode,
      unattendedMode: contentConfig.unattendedMode,
      reviewMode: contentConfig.reviewMode,
      contentAiProvider: contentConfig.aiProvider,
    },
    routingRules: {
      appendThreshold: routingRules.appendThreshold,
      candidateThreshold: routingRules.candidateThreshold,
      minimumTopicOverlapRatio: routingRules.minimumTopicOverlapRatio,
      minimumBrandOverlapRatio: routingRules.minimumBrandOverlapRatio,
      minimumSupportMatches: routingRules.minimumSupportMatches,
      minimumContentAssetMatches: routingRules.minimumContentAssetMatches,
      requireThemeMatchForAppend: routingRules.requireThemeMatchForAppend,
    },
    summary: {
      discovered: rawOpportunities.length,
      approved: approved.length,
      watchlist: watchlist.length,
      rejected: rejected.length,
      appendExisting: routingSummary.appendExistingCount,
      thesisCandidates: routingSummary.createCandidateCount,
      clusters: clusters.length,
      sites: enrichedSites.length,
      pages: enrichedSites.reduce((sum, site) => sum + site.pages.length, 0),
      claims: wikiExport.counts.claims,
      pageBriefs: wikiExport.counts.pageBriefs,
      assets: wikiExport.counts.assets,
      averageAuditScore: round(
        enrichedSites.reduce((sum, site) => sum + site.audit.score, 0) / Math.max(enrichedSites.length, 1),
      ),
      totalForecastRevenue: round(
        enrichedSites.reduce((sum, site) => sum + site.monitoring.revenue, 0),
        2,
      ),
    },
    stages: stageResults,
    opportunities: {
      approved,
      watchlist,
      rejected,
    },
    routing: {
      thesisRegistry,
      summary: routingSummary,
    },
    clusters,
    sites: enrichedSites,
    deployment: {
      mode:
        autoRelease.status === 'triggered'
          ? 'auto-release-triggered'
          : autoRelease.status === 'disabled'
            ? 'local-static-preview'
            : 'release-candidate',
      indexUrl: new URL('/generated-sites/index.html', `${config.baseUrl}/`).toString(),
      providers: deploymentSites,
      autoRelease,
    },
    gates: {
      rules: experiment.gateRules,
      decisionRows,
    },
    seo: {
      ...seoReport,
      queues: seoQueues,
    },
    monitoring: {
      mode: currentMonitoringMode || config.monitoringMode,
      currentRun: currentRunSnapshot,
      historyPreview: history.slice(-6),
    },
    phase1: phase1Validation,
    phase2: phase2ExpansionTrigger,
    commerce: {
      intent: commercialIntentModel,
      assetPerformance: assetPerformanceView,
      liveOpsSnapshotAvailable: Boolean(commercialOpsSnapshot),
    },
    contentOps: {
      reviewQueue,
      assetReviewQueue,
      pageRefreshPlans,
      sourceRefreshQueue,
      wikiWritebackQueue,
      feedback: contentFeedback,
      playbook: contentPlaybook,
      artifactIndexUrl: new URL('/generated/content-artifacts/', `${config.baseUrl}/`).toString(),
      wikiIndexUrl: new URL('/generated/wiki-index.json', `${config.baseUrl}/`).toString(),
      wiki: {
        rootDir: wikiExport.rootDir,
        counts: wikiExport.counts,
        sites: wikiExport.sites,
      },
    },
  }

  await writeJson(path.join(generatedDir, 'pipeline-report.json'), pipelineReport)
  await writeJson(path.join(generatedDir, 'trends.json'), {
    generatedAt: config.generatedAt,
    sourceFeeds: dedupe(rawOpportunities.map((item) => item.source)),
    totalCandidates: approved.length,
    topScore: Math.max(...approved.map((item) => item.overallScore), 0),
    candidates: approved.map((item) => ({
      slug: item.slug,
      keyword: item.keyword,
      source: item.source,
      region: item.region,
      score: item.overallScore,
      searchIntent: item.searchIntent,
      freshness: item.freshness,
      launchAngle: item.reasons[0] ?? 'validated trend',
      summary: item.reasons.join('; '),
      keywords: item.keywordVariants,
      monetization: themePresets[item.theme].monetization,
      routeStatus: item.routing.status,
      matchedThesisKey: item.routing.matchedThesisKey,
      matchedDomain: item.routing.matchedDomain,
      candidateKey: item.routing.candidateKey,
      sitePath:
        item.routing.status === 'append_existing'
          ? `/generated-sites/${clusters.find((cluster) => cluster.opportunityIds.includes(item.id))?.siteSlug ?? item.slug}/index.html`
          : null,
      generatedAt: config.generatedAt,
    })),
  })
  await writeJson(path.join(generatedDir, 'deployment-report.json'), {
    generatedAt: config.generatedAt,
    sites: deploymentSites,
    autoRelease,
  })
  await writeJson(path.join(generatedDir, 'decision-log.json'), {
    generatedAt: config.generatedAt,
    rows: decisionRows,
  })
  await writeJson(path.join(generatedDir, 'seo-report.json'), seoReport)
  await writeJson(path.join(generatedDir, 'seo-queues.json'), seoQueues)
  await writeJson(path.join(generatedDir, 'review-queue.json'), {
    generatedAt: config.generatedAt,
    reviewMode: contentConfig.reviewMode,
    unattendedMode: contentConfig.unattendedMode,
    entries: reviewQueue,
  })
  await writeJson(path.join(generatedDir, 'asset-review-queue.json'), {
    generatedAt: config.generatedAt,
    entries: assetReviewQueue,
  })
  await writeJson(path.join(generatedDir, 'content-feedback.json'), contentFeedback)
  await writeJson(path.join(generatedDir, 'content-playbook.json'), contentPlaybook)
  await writeJson(path.join(artifactsDir, 'index.json'), {
    generatedAt: config.generatedAt,
    sites: enrichedSites.map((site) => ({
      siteSlug: site.siteSlug,
      thesisKey: site.cluster.thesisKey,
      sourcePackPath: `/generated/content-artifacts/${site.siteSlug}/source-pack.json`,
      researchDossierPath: `/generated/content-artifacts/${site.siteSlug}/research-dossier.json`,
      factPaths: (site.pageArtifacts ?? []).map((page) => `/generated/content-artifacts/${site.siteSlug}/facts/${page.fileName.replace(/\.html$/, '')}.json`),
      assetFlowPaths: safeArray(site.assetArtifacts).flatMap((asset) => [
        asset.landingPath,
        asset.thankYouPath,
        asset.downloadPath,
      ]),
      commercialOfferPaths: site.commercialOffer
        ? [site.commercialOffer.landingPath, site.commercialOffer.thankYouPath]
        : [],
      claimCount: site.claims.length,
      pageBriefCount: site.pageBriefs.length,
      assetCount: site.conversionAssets.length,
    })),
  })
  await writeJson(path.join(generatedDir, 'monitoring-history.json'), {
    generatedAt: config.generatedAt,
    history: history.slice(-6),
  })

  console.log(
    `Pipeline complete: ${approved.length} approved opportunities, ${clusters.length} clusters, ${enrichedSites.length} deployed sites.`,
  )
}

export { runPipeline }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPipeline()
}
