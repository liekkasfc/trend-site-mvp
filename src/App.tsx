import { useEffect, useMemo, useState } from 'react'

type StageStatus = 'completed' | 'attention' | 'prepared'

type StageResult = {
  key: string
  label: string
  status: StageStatus
  summary: string
  detail: string
  metrics: Record<string, number>
}

type RoutingDecision = {
  status: string
  matchedThesisKey: string | null
  matchedDomain: string | null
  score: number
  hardBlockReasons: string[]
  candidateKey: string | null
  reasons: string[]
}

type Opportunity = {
  id: string
  keyword: string
  slug: string
  source: string
  region: string
  categoryHint?: string
  theme: string
  searchIntent: string
  freshness: string
  demandProxy: number
  velocity: number
  commercialFit: number
  confidence: number
  overallScore: number
  riskFlags: string[]
  reasons: string[]
  status: string
  keywordVariants: string[]
  routing: RoutingDecision
}

type Cluster = {
  id: string
  slug: string
  theme: string
  label: string
  audience: string
  offer: string
  monetization: string[]
  leadMagnet: string
  ctaLabel: string
  expansionIdeas: string[]
  primaryKeyword: string
  siteSlug: string
  domainSuggestion: string
  approvedCount: number
  averageScore: number
  supportKeywords: string[]
  trackedKeywords: string[]
  siteDefinition?: string
  conversionAsset?: string
}

type SitePage = {
  slug: string
  navLabel?: string
  type: string
  path: string
  canonicalUrl: string
  title: string
  metaDescription: string
  wordCount: number
  internalLinkCount: number
  coveredIntents: string[]
  originalAnchors: string[]
  draftEngine?: string
  ctaHref?: string
  ctaEvent?: string
  sourceReferenceCount?: number
  materialSlotCount?: number
  commercialModuleCount?: number
  reviewSignals?: {
    needsSpotCheck: boolean
    reasons: string[]
  }
  contentStats?: {
    factCount: number
    verdictCount: number
    exampleCount: number
    sourceRefCount: number
    specificityScore: number
    genericPhraseCount: number
    genericParagraphCount: number
    aiFlavorParagraphCount: number
    lowEvidenceParagraphCount: number
    structuredUseCaseCount: number
    decisionPathCount: number
    workflowDetailCount: number
    assetPreviewCount: number
    beforeAfterCount: number
    deliveryFlowCount: number
    proofModuleCount: number
  }
  indexingDirective?: string
}

type ResearchResult = {
  title: string
  url: string
  domain: string
  snippet: string
  detectedYear: number | null
  intent: string
}

type FaqCandidate = {
  question: string
  source: string
}

type PublishResearch = {
  keyword: string
  topResults: ResearchResult[]
  communityPainResults: ResearchResult[]
  suggestions: string[]
  topIntents: string[]
  gapSummary: {
    comparisonCoverage: number
    pricingCoverage: number
    workflowCoverage: number
    outdatedResultCount: number
    communityPainCount: number
    gapOpportunities: string[]
  }
  faqCandidates: FaqCandidate[]
}

type SourcePackItem = {
  title: string
  url: string
  domain: string
  snippet: string
  detectedYear: number | null
  intent: string
}

type SourcePack = {
  keyword: string
  sourceCounts: {
    official: number
    competitive: number
    community: number
    workflow: number
    serp: number
  }
  liveSignals: {
    githubTopStars: number
    githubRecentRepos30d: number
    hackerNewsThreads: number
    huggingFaceMatches: number
    serpCommercialResults: number
  }
  categories: {
    official: SourcePackItem[]
    competitive: SourcePackItem[]
    community: SourcePackItem[]
    workflow: SourcePackItem[]
    serp: SourcePackItem[]
  }
}

type AuditIssue = {
  pageSlug: string
  path: string
  severity: string
  message: string
}

type ConversionAsset = {
  id: string
  title: string
  summary: string
  assetKind: string
  audience?: string
  primaryPages: string[]
  conversionEvent: string
  clickEvent: string
  formEvent: string
  unlockEvent: string
  deliveryEvent: string
  landingPath: string
  thankYouPath: string
  downloadPath: string
  deliverables: Array<{
    label: string
    detail: string
  }>
  deliverySteps: Array<{
    title: string
    detail: string
  }>
  useCaseLabels: string[]
  acceptanceChecks: string[]
  strongestUseCase?: string
  bestPageTypes?: string[]
  conversionQualityNote?: string
  refreshPriority?: string
  acceptance?: {
    acceptanceMode: string
    gateStatus: string
    acceptanceStatus: string
    totalScore: number
    estimatedReviewMinutes: number
    reviewRequired: boolean
    failedChecks: Array<{
      key: string
      label: string
      score: number
      message: string
      critical: boolean
    }>
    rewriteInstructions: string[]
  } | null
}

type ProviderStatus = {
  key: string
  label: string
  status: string
  url?: string
  note: string
}

type SiteDeployment = {
  siteSlug: string
  previewUrl: string
  auditStatus: string
  releaseMode: string
  publishGateStatus: string
  bundlePath: string
  providers: ProviderStatus[]
}

type SiteMonitoring = {
  siteSlug: string
  mode: string
  impressions: number
  clicks: number
  ctr: number
  avgPosition: number
  conversions: number
  conversionRate: number
  revenue: number
  sessions: number
  rankingSource: string
  conversionSource: string
  rankingQueryCount: number
  liveTop50KeywordCount: number
  liveTop20KeywordCount: number
  gscStatus: string
  ga4Status: string
  gscLookbackDays: number
  ga4LookbackDays: number
  conversionEvents: string[]
  notes: string[]
  deltaFromPrevious: {
    impressions: number
    clicks: number
    avgPosition: number
    conversions: number
    revenue: number
  } | null
}

type SiteHistoryPoint = SiteMonitoring & {
  runId: string
  generatedAt: string
  seeded: boolean
}

type OptimizationAction = {
  priority: string
  title: string
  reason: string
}

type LifecycleDecision = {
  state: string
  reason: string
  nextMove: string
}

type SiteGates = {
  opportunity: {
    status: string
    approvedTopics: number
    evidence: Array<{
      keyword: string
      status: string
      trendPass: boolean
      commercialPass: boolean
      supportPass: boolean
      githubTopStars: number
      githubRecentRepos30d: number
      hackerNewsDiscussionCount30d: number
      huggingFaceMatches: number
      serpCommercialResults: number
      serpProductResults: number
    }>
  }
  publish: {
    status: string
    informationGapPass: boolean
    completenessPass: boolean
    nonTemplatePass: boolean
    evidence: {
      outdatedSerpResults: number
      forumPainThreads: number
      uniqueAssetCount: number
      searchIntentCoverage: number
      faqRealQueryCoverage: number
      originalAnchorCount: number
      aiFluffRatio: number
      genericPhrasePages: number
      aiFlavorPages: number
      lowEvidencePages: number
      gapOpportunities: string[]
      topIntents: string[]
    }
  }
  expansion: {
    overall: string
    day14: {
      indexedPageRatio: number
      indexablePageRatio: number
      impressions: number
      ctr: number
      avgPosition: number
      hasTop50Entry: boolean
      top50KeywordCount: number
      trackedKeywordCount: number
      status: string
      reason: string
      nextAction: string
    }
    day30: {
      impressions: number
      ctr: number
      avgPosition: number
      conversions: number
      hasCommercialSignal: boolean
      hasTop20Entry: boolean
      top20KeywordCount: number
      trackedKeywordCount: number
      momentum: string
      declineCheckpoints: number
      intervalStates: string[]
      status: string
      reason: string
      nextAction: string
    }
  }
}

type SiteRecord = {
  siteSlug: string
  siteName: string
  cluster: Cluster
  research: PublishResearch
  sourcePack: SourcePack
  homePath: string
  pages: SitePage[]
  audit: {
    score: number
    status: string
    issues: AuditIssue[]
    antiGeneric: {
      genericPhraseHits: number
      genericParagraphs: number
      aiFlavorParagraphs: number
      lowEvidenceParagraphs: number
      structuredUseCasePages: number
      proofRichPages: number
    }
  }
  conversionAssets: ConversionAsset[]
  gates: SiteGates
  deployment: SiteDeployment
  monitoring: SiteMonitoring
  monitoringHistory?: SiteHistoryPoint[]
  optimization: OptimizationAction[]
  lifecycle: LifecycleDecision
}

type Phase1Validation = {
  thesisKey: string
  siteSlug: string
  status: string
  summary: string
  checklist: Array<{
    key: string
    label: string
    status: string
    detail: string
  }>
  acceptance: Array<{
    label: string
    status: string
    detail: string
  }>
  nextMoves: string[]
}

type EngineStatus = {
  key: string
  label: string
  status: string
  note: string
}

type MonitoringRun = {
  runId: string
  generatedAt: string
  mode: string
  seeded: boolean
  sites: SiteMonitoring[]
}

type DecisionRow = {
  thesis: string
  trendScore: number
  commercialIntent: number
  supportPages: number
  gate1: string
  publishPages: number
  averageQualityScore: number
  gate2: string
  day30Impressions: number
  gate3: string
  conclusion: string
}

type ThesisRegistryRecord = {
  thesisKey: string
  status: string
  domain: string | null
  siteSlug: string
  theme: string
  label: string
  thesisName: string
  audience: string
  intentTypes: string[]
  monetization: string[]
  seedKeywords: string[]
  topicKeywords: string[]
  contentAssets: string[]
  brandBoundary: string
}

type CandidateBacklogItem = {
  keyword: string
  candidateKey: string
  theme: string
  matchedThesisKey: string
  score: number
  hardBlockReasons: string[]
}

type ReviewQueueEntry = {
  siteSlug: string
  pageSlug: string
  pageType: string
  reviewMode: string
  draftEngine: string
  reasons: string[]
  verdictCount: number
  factCount: number
  exampleCount: number
  sourceRefCount: number
  ctaTitle: string
}

type AssetReviewQueueEntry = {
  siteSlug: string
  assetSlug: string
  assetTitle: string
  assetKind: string
  acceptanceMode: string
  acceptanceStatus: string
  totalScore: number
  estimatedReviewMinutes: number
  reviewRequired: boolean
  failedChecks: string[]
  reviewerPrompt: string
  rewriteInstructions: string[]
  suggestedAction: string
}

type ContentFeedback = {
  generatedAt: string
  recentRuns: Array<{
    runId: string
    generatedAt: string
    mode: string
  }>
  pageTypeSignals: Array<{
    pageType: string
    pageCount: number
    averageFacts: number
    averageVerdicts: number
    averageExamples: number
    averageRefs: number
    guidance: string
  }>
  siteRecommendations: Array<{
    siteSlug: string
    lifecycle: string
    nextMove: string
    contentActions: string[]
  }>
}

type ContentPlaybookManualPattern = {
  pageType: string
  reviewedPages: number
  guidance: string
}

type ContentPlaybookSiteRule = {
  siteSlug: string
  titleStrategy: string
  metaStrategy: string
  ctaStrategy: string
  supportingPageStrategy: string
  guidance: string
  reasons: string[]
}

type ContentPlaybookPageRule = {
  pageType: string
  targets: {
    facts: number
    verdicts: number
    examples: number
    refs: number
  }
  introStrategy: string
  ctaStrategy: string
  evidenceStrategy: string
  manualReviewCount: number
  sourceSignals: {
    averageFacts: number
    averageVerdicts: number
    averageExamples: number
    averageRefs: number
  }
  guidance: string
  reasons: string[]
}

type ContentPlaybook = {
  generatedAt: string
  basedOnFeedbackGeneratedAt: string | null
  basedOnRunCount: number
  globalRules: {
    minFacts: number
    minVerdicts: number
    minExamples: number
    minRefs: number
    reviewMode: string
    unattendedMode: boolean
  }
  siteRules: ContentPlaybookSiteRule[]
  manualPatterns: ContentPlaybookManualPattern[]
  pageTypeRules: ContentPlaybookPageRule[]
}

type WikiSiteSummary = {
  siteSlug: string
  thesisKey: string
  clusterId: string
  reviewId: string
  dossierPath: string
  claimCount: number
  pageBriefCount: number
  assetCount: number
  sourceCount: number
  experimentCount: number
}

type PipelineReport = {
  runId: string
  generatedAt: string
  baseUrl: string
  experiment: {
    thesisKey: string
    thesisLabel: string
    thesisName: string
    siteDefinition: string
    targetAudience: string
    offer: string
    monetization: string[]
    leadMagnet: string
    conversionAsset: string
    pageTemplates: string[]
  }
  summary: {
    discovered: number
    approved: number
    watchlist: number
    rejected: number
    clusters: number
    sites: number
    pages: number
    claims: number
    pageBriefs: number
    assets: number
    averageAuditScore: number
    totalForecastRevenue: number
  }
  stages: StageResult[]
  opportunities: {
    approved: Opportunity[]
    watchlist: Opportunity[]
    rejected: Opportunity[]
  }
  clusters: Cluster[]
  sites: SiteRecord[]
  deployment: {
    mode: string
    indexUrl: string
  }
  gates: {
    rules: {
      opportunityApproval: {
        trend: Record<string, number | boolean>
        commercial: Record<string, number>
        support: Record<string, number>
      }
      publishGate: Record<string, number>
      expansionGate: {
        day14: Record<string, number>
        day30: Record<string, number | boolean>
      }
    }
    decisionRows: DecisionRow[]
  }
  seo: {
    sitemapUrl: string
    robotsUrl: string
    llmsUrl: string
    queuedUrls: string[]
    blockedUrls: string[]
    queuedSiteSlugs: string[]
    blockedSiteSlugs: string[]
    engines: EngineStatus[]
    queues?: {
      ctrOptimizationQueue: Array<{
        siteSlug: string
        reason: string
      }>
      visibilityQueue: Array<{
        siteSlug: string
        reason: string
      }>
      entryPageDiagnostics: Array<{
        siteSlug: string
      }>
    }
  }
  monitoring: {
    mode: string
    currentRun: MonitoringRun
    historyPreview: MonitoringRun[]
  }
  phase1: Phase1Validation
  routing: {
    thesisRegistry: ThesisRegistryRecord[]
    summary: {
      appendExistingCount: number
      createCandidateCount: number
      rejectOrWatchCount: number
      appendByThesis: Array<{
        thesisKey: string
        domain: string | null
        count: number
      }>
      candidateBacklog: CandidateBacklogItem[]
    }
  }
  contentOps: {
    reviewQueue: ReviewQueueEntry[]
    assetReviewQueue: AssetReviewQueueEntry[]
    feedback: ContentFeedback
    playbook: ContentPlaybook
    artifactIndexUrl: string
    wikiIndexUrl: string
    wiki: {
      rootDir: string
      counts: Record<string, number>
      sites: WikiSiteSummary[]
    }
  }
}

const integer = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const ROUTE_LABELS: Record<string, string> = {
  append_existing: '接入现有 thesis',
  create_candidate: '进入候选池',
  reject_or_watch: '拒绝/观察',
}

const THESIS_STATUS_LABELS: Record<string, string> = {
  active: 'active',
  candidate: 'candidate',
}

function getRouteLabel(status: string) {
  return ROUTE_LABELS[status] ?? status
}

function getThesisStatusLabel(status: string) {
  return THESIS_STATUS_LABELS[status] ?? status
}

function App() {
  const [report, setReport] = useState<PipelineReport | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/generated/pipeline-report.json', {
          headers: { 'Cache-Control': 'no-cache' },
        })

        if (!response.ok) {
          throw new Error(`Failed to load pipeline report: ${response.status}`)
        }

        const data = (await response.json()) as PipelineReport
        setReport(data)
        setSelectedSlug(data.sites[0]?.siteSlug ?? '')
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unknown load error')
      }
    }

    void load()
  }, [])

  const selectedSite = useMemo(
    () => report?.sites.find((site) => site.siteSlug === selectedSlug) ?? null,
    [report, selectedSlug],
  )
  const selectedCoveredIntents = useMemo(
    () =>
      selectedSite == null
        ? []
        : Array.from(new Set(selectedSite.pages.flatMap((page) => page.coveredIntents ?? []))),
    [selectedSite],
  )
  const selectedOriginalAnchors = useMemo(
    () =>
      selectedSite == null
        ? []
        : Array.from(new Set(selectedSite.pages.flatMap((page) => page.originalAnchors ?? []))),
    [selectedSite],
  )
  const routedIntake = useMemo(
    () =>
      report == null
        ? []
        : [
            ...report.opportunities.approved,
            ...report.opportunities.watchlist,
            ...report.opportunities.rejected,
          ],
    [report],
  )
  const selectedReviewQueue = useMemo(
    () =>
      report == null || selectedSite == null
        ? []
        : report.contentOps.reviewQueue.filter((item) => item.siteSlug === selectedSite.siteSlug),
    [report, selectedSite],
  )
  const selectedAssetReviewQueue = useMemo(
    () =>
      report == null || selectedSite == null
        ? []
        : report.contentOps.assetReviewQueue.filter((item) => item.siteSlug === selectedSite.siteSlug),
    [report, selectedSite],
  )
  const selectedFeedbackSignals = useMemo(
    () =>
      report == null || selectedSite == null
        ? []
        : report.contentOps.feedback.pageTypeSignals.filter((item) =>
            selectedSite.pages.some((page) => page.type === item.pageType),
          ),
    [report, selectedSite],
  )
  const selectedFeedbackRecommendation = useMemo(
    () =>
      report == null || selectedSite == null
        ? null
        : report.contentOps.feedback.siteRecommendations.find(
            (item) => item.siteSlug === selectedSite.siteSlug,
          ) ?? null,
    [report, selectedSite],
  )
  const selectedSitePlaybookRule = useMemo(
    () =>
      report == null || selectedSite == null
        ? null
        : report.contentOps.playbook.siteRules.find((item) => item.siteSlug === selectedSite.siteSlug) ??
          null,
    [report, selectedSite],
  )
  const selectedPlaybookRules = useMemo(
    () =>
      report == null || selectedSite == null
        ? []
        : report.contentOps.playbook.pageTypeRules.filter((item) =>
            selectedSite.pages.some((page) => page.type === item.pageType),
          ),
    [report, selectedSite],
  )
  const selectedManualPatterns = useMemo(
    () =>
      report == null || selectedSite == null
        ? []
        : report.contentOps.playbook.manualPatterns.filter((item) =>
            selectedSite.pages.some((page) => page.type === item.pageType),
          ),
    [report, selectedSite],
  )
  const selectedWikiSite = useMemo(
    () =>
      report == null || selectedSite == null
        ? null
        : report.contentOps.wiki.sites.find((item) => item.siteSlug === selectedSite.siteSlug) ?? null,
    [report, selectedSite],
  )
  const selectedPhase1 = useMemo(
    () =>
      report == null || selectedSite == null || report.phase1.siteSlug !== selectedSite.siteSlug
        ? null
        : report.phase1,
    [report, selectedSite],
  )

  if (error) {
    return (
      <main className="shell">
        <section className="empty-band">
          <h1>Trend Site Pipeline</h1>
          <p>{error}</p>
          <p>Run <code>pnpm run pipeline</code> to refresh the generated artifacts.</p>
        </section>
      </main>
    )
  }

  if (!report || !selectedSite) {
    return (
      <main className="shell">
        <section className="empty-band">
          <h1>Trend Site Pipeline</h1>
          <p>Loading pipeline report...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Experiment Thesis</p>
          <h1>{report.experiment.thesisName}</h1>
          <p>
            {report.experiment.siteDefinition}
          </p>
          <div className="tag-row hero-tags">
            {report.experiment.pageTemplates.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {report.experiment.monetization.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <div className="metric-grid">
          <article className="metric-card">
            <span>本轮通过</span>
            <strong>{integer.format(report.summary.approved)}</strong>
          </article>
          <article className="metric-card">
            <span>站点数</span>
            <strong>{integer.format(report.summary.sites)}</strong>
          </article>
          <article className="metric-card">
            <span>页面数</span>
            <strong>{integer.format(report.summary.pages)}</strong>
          </article>
          <article className="metric-card">
            <span>Claim Cards</span>
            <strong>{integer.format(report.summary.claims)}</strong>
          </article>
          <article className="metric-card">
            <span>Asset Cards</span>
            <strong>{integer.format(report.summary.assets)}</strong>
          </article>
          <article className="metric-card">
            <span>Revenue Signal</span>
            <strong>{money.format(report.summary.totalForecastRevenue)}</strong>
          </article>
        </div>
      </section>

      <section className="intake-band">
        <div className="section-head">
          <div>
            <p className="eyebrow">Manual Gates</p>
            <h2>三个人工关口</h2>
          </div>
          <code>{report.gates.decisionRows[0]?.conclusion ?? 'pending'}</code>
        </div>
        <div className="gate-grid">
          <article className="list-panel">
            <h3>机会批准关</h3>
            <ul className="stack-list">
              <li>
                <strong>Trend continuity</strong>
                <p>
                  GitHub Stars {String(report.gates.rules.opportunityApproval.trend.githubStars)},
                  X likes {String(report.gates.rules.opportunityApproval.trend.xLikes)},
                  28d trend ratio {String(report.gates.rules.opportunityApproval.trend.trend28OverPrev28)}
                </p>
              </li>
              <li>
                <strong>Commercial intent</strong>
                <p>
                  SERP affiliate pages {String(report.gates.rules.opportunityApproval.commercial.serpAffiliatePages)},
                  CPC {String(report.gates.rules.opportunityApproval.commercial.cpcUsd)}
                </p>
              </li>
              <li>
                <strong>Support breadth</strong>
                <p>
                  Need {String(report.gates.rules.opportunityApproval.support.supportPageCount)} support pages
                  or {String(report.gates.rules.opportunityApproval.support.supportPageCountWithAsset)} plus a conversion asset.
                </p>
              </li>
            </ul>
          </article>
          <article className="list-panel">
            <h3>发布关</h3>
            <ul className="stack-list">
              <li>
                <strong>信息差</strong>
                <p>Need outdated SERP coverage, forum pain, or at least one unique asset.</p>
              </li>
              <li>
                <strong>完整性</strong>
                <p>
                  Search intent coverage {String(report.gates.rules.publishGate.searchIntentCoverage)} and
                  FAQ real-query coverage {String(report.gates.rules.publishGate.faqRealQueryCoverage)}.
                </p>
              </li>
              <li>
                <strong>非模板化</strong>
                <p>
                  Original anchors {String(report.gates.rules.publishGate.originalAnchorCount)} with AI fluff
                  below {(Number(report.gates.rules.publishGate.maxAiFluffRatio) * 100).toFixed(0)}%.
                </p>
              </li>
            </ul>
          </article>
          <article className="list-panel">
            <h3>扩展关</h3>
            <ul className="stack-list">
              <li>
                <strong>T+14</strong>
                <p>
                  Indexed page ratio {String(report.gates.rules.expansionGate.day14.minIndexedPageRatio)},
                  healthy impressions {String(report.gates.rules.expansionGate.day14.healthyImpressions)}, top-50
                  signal from GSC when configured, otherwise proxy at avg position{' '}
                  {String(report.gates.rules.expansionGate.day14.top50ProxyPositionMax)}.
                </p>
              </li>
              <li>
                <strong>T+30</strong>
                <p>
                  Healthy CTR {(Number(report.gates.rules.expansionGate.day30.healthyCtr) * 100).toFixed(1)}%,
                  poor impressions {String(report.gates.rules.expansionGate.day30.poorImpressions)}, top-20
                  signal from GSC when configured, otherwise proxy at avg position{' '}
                  {String(report.gates.rules.expansionGate.day30.top20ProxyPositionMax)}.
                </p>
              </li>
              <li>
                <strong>Decision log</strong>
                <p>
                  {report.gates.decisionRows[0]?.gate3 ?? 'pending'} / stop after{' '}
                  {String(report.gates.rules.expansionGate.day30.declineCheckpointsToStop)} declining checkpoints.
                </p>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section className="stage-band">
        <div className="section-head">
          <div>
            <p className="eyebrow">Pipeline Status</p>
            <h2>11 个阶段</h2>
          </div>
          <code>{report.runId}</code>
        </div>
        <div className="stage-grid">
          {report.stages.map((stage) => (
            <article key={stage.key} className={`stage-card ${stage.status}`}>
              <div className="stage-topline">
                <strong>{stage.label}</strong>
                <span className={`status-pill ${stage.status}`}>{stage.status}</span>
              </div>
              <p>{stage.summary}</p>
              <small>{stage.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="intake-band">
        <div className="section-head">
          <div>
            <p className="eyebrow">Routing Layer</p>
            <h2>第二个 thesis 样板</h2>
          </div>
          <span className="muted">
            {report.routing.thesisRegistry.length} theses / {report.routing.summary.candidateBacklog.length} backlog
          </span>
        </div>
        <div className="routing-summary-grid">
          <article className="summary-card">
            <span>接入现有 thesis</span>
            <strong>{integer.format(report.routing.summary.appendExistingCount)}</strong>
            <p>这些热词会继续进入聚类、内容生成和页面构建。</p>
          </article>
          <article className="summary-card">
            <span>进入候选池</span>
            <strong>{integer.format(report.routing.summary.createCandidateCount)}</strong>
            <p>这些热词匹配第二条 thesis，但暂时不新建独立站点。</p>
          </article>
          <article className="summary-card">
            <span>拒绝 / 观察</span>
            <strong>{integer.format(report.routing.summary.rejectOrWatchCount)}</strong>
            <p>要么 Gate 1 没过，要么还不值得进入现有 thesis。</p>
          </article>
        </div>
        <div className="routing-grid">
          <article className="list-panel">
            <h3>Thesis Registry</h3>
            <ul className="stack-list">
              {report.routing.thesisRegistry.map((thesis) => (
                <li key={thesis.thesisKey}>
                  <div className="list-row-topline">
                    <strong>{thesis.label}</strong>
                    <span className={`status-pill ${thesis.status}`}>
                      {getThesisStatusLabel(thesis.status)}
                    </span>
                  </div>
                  <p>{thesis.thesisName}</p>
                  <p>{thesis.domain ?? '未绑定域名'} / {thesis.audience}</p>
                  <div className="tag-row">
                    <span>{thesis.theme}</span>
                    {thesis.contentAssets.slice(0, 2).map((asset) => (
                      <span key={asset}>{asset}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </article>
          <article className="list-panel">
            <h3>Candidate Backlog</h3>
            <ul className="stack-list">
              {report.routing.summary.candidateBacklog.length === 0 ? (
                <li>
                  <strong>暂无候选 thesis 机会</strong>
                  <p>当前所有过关热词都直接并入已有 active thesis。</p>
                </li>
              ) : (
                report.routing.summary.candidateBacklog.map((item) => (
                  <li key={item.keyword}>
                    <div className="list-row-topline">
                      <strong>{item.keyword}</strong>
                      <span className="status-pill create_candidate">
                        {getRouteLabel('create_candidate')}
                      </span>
                    </div>
                    <p>{item.candidateKey} / routing score {item.score}</p>
                    <p>
                      {item.hardBlockReasons.length > 0
                        ? item.hardBlockReasons.join(' | ')
                        : '当前没有硬阻断，等后续验证后可以晋升成独立 thesis。'}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </article>
          <article className="list-panel">
            <h3>Routing Decisions</h3>
            <ul className="stack-list">
              {routedIntake.map((item) => (
                <li key={item.id}>
                  <div className="list-row-topline">
                    <strong>{item.keyword}</strong>
                    <span className={`status-pill ${item.routing.status}`}>
                      {getRouteLabel(item.routing.status)}
                    </span>
                  </div>
                  <p>{item.routing.matchedThesisKey ?? 'unmatched'} / routing score {item.routing.score}</p>
                  <p>{item.routing.reasons[0] ?? 'No routing explanation available.'}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="intake-band">
        <div className="section-head">
          <div>
            <p className="eyebrow">Discovery Intake</p>
            <h2>候选池和聚类结果</h2>
          </div>
          <span className="muted">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </span>
        </div>
        <div className="intake-grid">
          <div className="list-panel">
            <h3>Approved</h3>
            <ul className="compact-list">
              {report.opportunities.approved.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <span>{item.keyword}</span>
                  <strong>{item.overallScore}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="list-panel">
            <h3>Watchlist</h3>
            <ul className="compact-list">
              {report.opportunities.watchlist.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <span>{item.keyword}</span>
                  <strong>{item.overallScore}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="list-panel">
            <h3>Clusters</h3>
            <ul className="compact-list">
              {report.clusters.map((cluster) => (
                <li key={cluster.id}>
                  <span>{cluster.label}</span>
                  <strong>{cluster.approvedCount}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="workspace-band">
        <aside className="site-list-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Sites</p>
              <h2>生成站点</h2>
            </div>
            <a href={report.deployment.indexUrl} target="_blank" rel="noreferrer">
              打开总览
            </a>
          </div>

          <div className="site-list">
            {report.sites.map((site) => {
              const active = site.siteSlug === selectedSite.siteSlug
              return (
                <button
                  key={site.siteSlug}
                  type="button"
                  className={`site-row${active ? ' active' : ''}`}
                  onClick={() => setSelectedSlug(site.siteSlug)}
                >
                  <div className="site-row-topline">
                    <strong>{site.siteName}</strong>
                    <span>{site.audit.score}</span>
                  </div>
                  <p>{site.cluster.audience}</p>
                  <div className="tag-row">
                    <span>{site.cluster.label}</span>
                    <span>{site.gates.publish.status}</span>
                    <span>{site.deployment.releaseMode}</span>
                    <span>{site.monitoring.avgPosition}</span>
                    <span>{money.format(site.monitoring.revenue)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="detail-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Selected Site</p>
              <h2>{selectedSite.siteName}</h2>
            </div>
            <a href={selectedSite.deployment.previewUrl} target="_blank" rel="noreferrer">
              打开站点
            </a>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span>Gate 1</span>
              <strong>{selectedSite.gates.opportunity.status}</strong>
              <p>{selectedSite.gates.opportunity.approvedTopics} approved topics</p>
            </article>
            <article className="summary-card">
              <span>Gate 2</span>
              <strong>{selectedSite.gates.publish.status}</strong>
              <p>{selectedSite.deployment.releaseMode} / {selectedSite.audit.score} audit score</p>
            </article>
            <article className="summary-card">
              <span>Gate 3</span>
              <strong>{selectedSite.gates.expansion.day30.status}</strong>
              <p>{selectedSite.gates.expansion.overall} / {integer.format(selectedSite.monitoring.impressions)} impressions</p>
            </article>
            <article className="summary-card">
              <span>Lifecycle</span>
              <strong>{selectedSite.lifecycle.state}</strong>
              <p>{selectedSite.lifecycle.nextMove}</p>
            </article>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>关键词和变现</h3>
              <p>{report.experiment.offer}</p>
              <div className="tag-row">
                {selectedSite.cluster.trackedKeywords.slice(0, 6).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
              <div className="tag-row">
                {selectedSite.cluster.monetization.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="detail-column">
              <h3>站点定义</h3>
              <p>{report.experiment.siteDefinition}</p>
              <div className="tag-row">
                <span>{report.experiment.leadMagnet}</span>
                <span>{report.experiment.conversionAsset}</span>
              </div>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <div className="section-head">
                <div>
                  <h3>Source Pack</h3>
                </div>
                <a href={report.contentOps.artifactIndexUrl} target="_blank" rel="noreferrer">
                  打开 artifacts
                </a>
              </div>
              <ul className="detail-list">
                <li>
                  <span>Primary keyword</span>
                  <strong>{selectedSite.sourcePack.keyword}</strong>
                </li>
                <li>
                  <span>Official</span>
                  <strong>{selectedSite.sourcePack.sourceCounts.official}</strong>
                </li>
                <li>
                  <span>Competitive</span>
                  <strong>{selectedSite.sourcePack.sourceCounts.competitive}</strong>
                </li>
                <li>
                  <span>Community</span>
                  <strong>{selectedSite.sourcePack.sourceCounts.community}</strong>
                </li>
                <li>
                  <span>Workflow</span>
                  <strong>{selectedSite.sourcePack.sourceCounts.workflow}</strong>
                </li>
                <li>
                  <span>SERP refs</span>
                  <strong>{selectedSite.sourcePack.sourceCounts.serp}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                {selectedSite.sourcePack.categories.official.slice(0, 3).map((item) => (
                  <li key={item.url}>
                    <strong>{item.title}</strong>
                    <p>{item.domain} / {item.intent}</p>
                    <p>{item.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="detail-column">
              <div className="section-head">
                <div>
                  <h3>Hermes Wiki</h3>
                </div>
                <a href={report.contentOps.wikiIndexUrl} target="_blank" rel="noreferrer">
                  打开 wiki index
                </a>
              </div>
              <ul className="detail-list">
                <li>
                  <span>Canonical root</span>
                  <strong>{report.contentOps.wiki.rootDir}</strong>
                </li>
                <li>
                  <span>Claim cards</span>
                  <strong>{integer.format(selectedWikiSite?.claimCount ?? 0)}</strong>
                </li>
                <li>
                  <span>Page briefs</span>
                  <strong>{integer.format(selectedWikiSite?.pageBriefCount ?? 0)}</strong>
                </li>
                <li>
                  <span>Conversion assets</span>
                  <strong>{integer.format(selectedWikiSite?.assetCount ?? 0)}</strong>
                </li>
                <li>
                  <span>Source cards</span>
                  <strong>{integer.format(selectedWikiSite?.sourceCount ?? 0)}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                <li>
                  <strong>Research dossier</strong>
                  <p>{selectedWikiSite?.dossierPath ?? 'No dossier exported for this site yet.'}</p>
                  <p>Pages now generate from source-pack, research dossier, claim cards, and page briefs.</p>
                </li>
                <li>
                  <strong>Review + experiment cards</strong>
                  <p>
                    review {selectedWikiSite?.reviewId ?? 'n/a'} / experiments{' '}
                    {integer.format(selectedWikiSite?.experimentCount ?? 0)}
                  </p>
                  <p>Optimization actions now land in wiki as reusable review and experiment records.</p>
                </li>
              </ul>
            </div>

            <div className="detail-column">
              <h3>Unattended Content Ops</h3>
              <ul className="detail-list">
                <li>
                  <span>Review queue</span>
                  <strong>{selectedReviewQueue.length}</strong>
                </li>
                <li>
                  <span>Feedback snapshot</span>
                  <strong>{new Date(report.contentOps.feedback.generatedAt).toLocaleString()}</strong>
                </li>
                <li>
                  <span>Tracked page types</span>
                  <strong>{selectedFeedbackSignals.length}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                {selectedReviewQueue.slice(0, 4).map((entry) => (
                  <li key={`${entry.pageSlug}-${entry.pageType}`}>
                    <strong>{entry.pageSlug}</strong>
                    <p>
                      {entry.pageType} / facts {entry.factCount} / verdicts {entry.verdictCount} / refs {entry.sourceRefCount}
                    </p>
                    <p>{entry.reasons.join(' / ')}</p>
                  </li>
                ))}
                {selectedFeedbackSignals.slice(0, 3).map((item) => (
                  <li key={item.pageType}>
                    <strong>{item.pageType}</strong>
                    <p>
                      facts {item.averageFacts} / verdicts {item.averageVerdicts} / examples {item.averageExamples} / refs {item.averageRefs}
                    </p>
                    <p>{item.guidance}</p>
                  </li>
                ))}
                {selectedFeedbackRecommendation ? (
                  <li key={selectedFeedbackRecommendation.siteSlug}>
                    <strong>{selectedFeedbackRecommendation.lifecycle}</strong>
                    <p>{selectedFeedbackRecommendation.nextMove}</p>
                    <p>{selectedFeedbackRecommendation.contentActions.join(' / ')}</p>
                  </li>
                ) : null}
              </ul>
            </div>

            <div className="detail-column">
              <h3>Feedback Loop</h3>
              <ul className="detail-list">
                <li>
                  <span>Playbook snapshot</span>
                  <strong>{new Date(report.contentOps.playbook.generatedAt).toLocaleString()}</strong>
                </li>
                <li>
                  <span>Based on runs</span>
                  <strong>{integer.format(report.contentOps.playbook.basedOnRunCount)}</strong>
                </li>
                <li>
                  <span>Relevant page rules</span>
                  <strong>{selectedPlaybookRules.length}</strong>
                </li>
                <li>
                  <span>Manual patterns</span>
                  <strong>{selectedManualPatterns.length}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                {selectedSitePlaybookRule ? (
                  <li key={selectedSitePlaybookRule.siteSlug}>
                    <strong>Site rule</strong>
                    <p>
                      title {selectedSitePlaybookRule.titleStrategy} / meta{' '}
                      {selectedSitePlaybookRule.metaStrategy} / CTA {selectedSitePlaybookRule.ctaStrategy}
                    </p>
                    <p>{selectedSitePlaybookRule.guidance}</p>
                  </li>
                ) : null}
                {selectedPlaybookRules.slice(0, 4).map((rule) => (
                  <li key={rule.pageType}>
                    <strong>{rule.pageType}</strong>
                    <p>
                      targets facts {rule.targets.facts} / verdicts {rule.targets.verdicts} / examples{' '}
                      {rule.targets.examples} / refs {rule.targets.refs}
                    </p>
                    <p>
                      intro {rule.introStrategy} / CTA {rule.ctaStrategy} / evidence {rule.evidenceStrategy}
                    </p>
                    <p>{rule.guidance}</p>
                  </li>
                ))}
                {selectedManualPatterns.slice(0, 2).map((pattern) => (
                  <li key={pattern.pageType}>
                    <strong>{pattern.pageType} manual pattern</strong>
                    <p>{pattern.reviewedPages} reviewed pages</p>
                    <p>{pattern.guidance}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>Anti-generic audit</h3>
              <ul className="detail-list">
                <li>
                  <span>Generic phrase hits</span>
                  <strong>{selectedSite.audit.antiGeneric.genericPhraseHits}</strong>
                </li>
                <li>
                  <span>Generic paragraphs</span>
                  <strong>{selectedSite.audit.antiGeneric.genericParagraphs}</strong>
                </li>
                <li>
                  <span>AI-flavored paragraphs</span>
                  <strong>{selectedSite.audit.antiGeneric.aiFlavorParagraphs}</strong>
                </li>
                <li>
                  <span>Low-evidence paragraphs</span>
                  <strong>{selectedSite.audit.antiGeneric.lowEvidenceParagraphs}</strong>
                </li>
                <li>
                  <span>Structured use-case pages</span>
                  <strong>{selectedSite.audit.antiGeneric.structuredUseCasePages}</strong>
                </li>
                <li>
                  <span>Proof-rich pages</span>
                  <strong>{selectedSite.audit.antiGeneric.proofRichPages}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                {selectedSite.pages
                  .filter(
                    (page) =>
                      (page.contentStats?.genericParagraphCount ?? 0) > 0 ||
                      (page.contentStats?.aiFlavorParagraphCount ?? 0) > 0 ||
                      (page.contentStats?.lowEvidenceParagraphCount ?? 0) > 0,
                  )
                  .slice(0, 4)
                  .map((page) => (
                    <li key={page.path}>
                      <strong>{page.slug}</strong>
                      <p>
                        generic {page.contentStats?.genericParagraphCount ?? 0} / AI flavor{' '}
                        {page.contentStats?.aiFlavorParagraphCount ?? 0} / low evidence{' '}
                        {page.contentStats?.lowEvidenceParagraphCount ?? 0}
                      </p>
                      <p>
                        specificity {page.contentStats?.specificityScore ?? 0} / proof modules{' '}
                        {page.contentStats?.proofModuleCount ?? 0}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="detail-column">
              <h3>Asset delivery flow</h3>
              <ul className="detail-list">
                <li>
                  <span>Assets</span>
                  <strong>{selectedSite.conversionAssets.length}</strong>
                </li>
                <li>
                  <span>Primary path</span>
                  <strong>{selectedSite.conversionAssets[0]?.title ?? 'n/a'}</strong>
                </li>
                <li>
                  <span>Asset review queue</span>
                  <strong>{selectedAssetReviewQueue.length}</strong>
                </li>
              </ul>
              <ul className="stack-list">
                {selectedSite.conversionAssets.map((asset) => (
                  <li key={asset.id}>
                    <strong>{asset.title}</strong>
                    <p>
                      {asset.assetKind} / pages {asset.primaryPages.join(', ')}
                    </p>
                    <p>
                      click {asset.clickEvent} / submit {asset.formEvent} / unlock {asset.unlockEvent} / delivery{' '}
                      {asset.deliveryEvent}
                    </p>
                    <p>
                      landing <code>{asset.landingPath}</code>
                    </p>
                    <p>
                      thank-you <code>{asset.thankYouPath}</code>
                    </p>
                    <p>
                      download <code>{asset.downloadPath}</code>
                    </p>
                    <p>{asset.useCaseLabels.join(' / ')}</p>
                    {asset.acceptance ? (
                      <>
                        <p>
                          mode {asset.acceptance.acceptanceMode} / status {asset.acceptance.acceptanceStatus} / score{' '}
                          {asset.acceptance.totalScore}
                        </p>
                        <p>
                          strongest use case {asset.strongestUseCase ?? 'n/a'} / refresh {asset.refreshPriority ?? 'n/a'}
                        </p>
                        <p>{asset.conversionQualityNote ?? 'No conversion quality note yet.'}</p>
                        {asset.acceptance.failedChecks.length > 0 ? (
                          <p>failed checks {asset.acceptance.failedChecks.map((item) => item.label).join(', ')}</p>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>Phase 1 revenue validation</h3>
              {selectedPhase1 ? (
                <>
                  <ul className="detail-list">
                    <li>
                      <span>Status</span>
                      <strong>{selectedPhase1.status}</strong>
                    </li>
                    <li>
                      <span>Site</span>
                      <strong>{selectedPhase1.siteSlug}</strong>
                    </li>
                    <li>
                      <span>Thesis</span>
                      <strong>{selectedPhase1.thesisKey}</strong>
                    </li>
                  </ul>
                  <ul className="stack-list">
                    <li>
                      <strong>Summary</strong>
                      <p>{selectedPhase1.summary}</p>
                    </li>
                    {selectedPhase1.checklist.map((item) => (
                      <li key={item.key}>
                        <strong>{item.label}</strong>
                        <p>
                          <span className="inline-pill">{item.status}</span> {item.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>当前选中站点还没有单独的 Phase 1 验收记录。</p>
              )}
            </div>

            <div className="detail-column">
              <h3>Acceptance</h3>
              {selectedPhase1 ? (
                <ul className="stack-list">
                  {selectedPhase1.acceptance.map((item) => (
                    <li key={item.label}>
                      <strong>{item.label}</strong>
                      <p>
                        <span className="inline-pill">{item.status}</span> {item.detail}
                      </p>
                    </li>
                  ))}
                  <li>
                    <strong>Next moves</strong>
                    <p>{selectedPhase1.nextMoves.join(' / ')}</p>
                  </li>
                </ul>
              ) : null}
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>SERP 证据</h3>
              <ul className="stack-list">
                {selectedSite.research.topResults.slice(0, 4).map((result) => (
                  <li key={result.url}>
                    <strong>{result.title}</strong>
                    <p>
                      {result.domain} / {result.intent}
                      {result.detectedYear == null ? '' : ` / ${result.detectedYear}`}
                    </p>
                    <p>{result.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="detail-column">
              <h3>真实查询和社区痛点</h3>
              <ul className="stack-list">
                <li>
                  <strong>Autocomplete queries</strong>
                  <p>{selectedSite.research.suggestions.join(' / ')}</p>
                </li>
                <li>
                  <strong>Top intents</strong>
                  <p>{selectedSite.gates.publish.evidence.topIntents.join(', ')}</p>
                </li>
                <li>
                  <strong>Community pain threads</strong>
                  <p>{selectedSite.gates.publish.evidence.forumPainThreads} matched threads</p>
                </li>
                {selectedSite.research.communityPainResults.slice(0, 2).map((result) => (
                  <li key={result.url}>
                    <strong>{result.title}</strong>
                    <p>{result.domain}</p>
                    <p>{result.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>页面清单</h3>
              <ul className="stack-list">
                {selectedSite.pages.map((page) => (
                  <li key={page.path}>
                    <strong>{page.slug}</strong>
                    <p>
                      {page.wordCount}w / {page.indexingDirective ?? 'index'} / intents{' '}
                      {page.coveredIntents.join(', ')}
                    </p>
                    <p>
                      CTA {page.ctaEvent ?? 'n/a'} / use cases {page.contentStats?.structuredUseCaseCount ?? 0} /
                      proof {page.contentStats?.proofModuleCount ?? 0}
                    </p>
                    <p>{page.originalAnchors.join(' | ')}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="detail-column">
              <h3>关口证据</h3>
              <ul className="stack-list">
                {selectedSite.gates.opportunity.evidence.map((item) => (
                  <li key={item.keyword}>
                    <strong>{item.keyword}</strong>
                    <p>
                      trend {item.trendPass ? 'yes' : 'no'} / commercial {item.commercialPass ? 'yes' : 'no'} /
                      support {item.supportPass ? 'yes' : 'no'}
                    </p>
                    <p>
                      GitHub stars {item.githubTopStars}, new repos 30d {item.githubRecentRepos30d}, HN threads {item.hackerNewsDiscussionCount30d}, HF matches {item.huggingFaceMatches}
                    </p>
                    <p>
                      SERP commercial {item.serpCommercialResults}, SERP products {item.serpProductResults}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>部署适配器</h3>
              <ul className="detail-list">
                <li>
                  <span>Release mode</span>
                  <strong>{selectedSite.deployment.releaseMode}</strong>
                </li>
                {selectedSite.deployment.providers.map((provider) => (
                  <li key={provider.key}>
                    <span>{provider.label}</span>
                    <strong>{provider.status}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="detail-column">
              <h3>SEO 状态</h3>
              <ul className="detail-list">
                <li>
                  <span>Queued URLs</span>
                  <strong>{report.seo.queuedUrls.length}</strong>
                </li>
                <li>
                  <span>Blocked URLs</span>
                  <strong>{report.seo.blockedUrls.length}</strong>
                </li>
                {report.seo.engines.map((engine) => (
                  <li key={engine.key}>
                    <span>{engine.label}</span>
                    <strong>{engine.status}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>监控指标</h3>
              <ul className="detail-list">
                <li>
                  <span>Monitoring Mode</span>
                  <strong>{selectedSite.monitoring.mode}</strong>
                </li>
                <li>
                  <span>CTR</span>
                  <strong>{(selectedSite.monitoring.ctr * 100).toFixed(1)}%</strong>
                </li>
                <li>
                  <span>Sessions</span>
                  <strong>{integer.format(selectedSite.monitoring.sessions)}</strong>
                </li>
                <li>
                  <span>Conversions</span>
                  <strong>{selectedSite.monitoring.conversions}</strong>
                </li>
                <li>
                  <span>Revenue</span>
                  <strong>{money.format(selectedSite.monitoring.revenue)}</strong>
                </li>
                <li>
                  <span>Indexed Ratio</span>
                  <strong>{(selectedSite.gates.expansion.day14.indexedPageRatio * 100).toFixed(0)}%</strong>
                </li>
                <li>
                  <span>GSC / GA4</span>
                  <strong>{selectedSite.monitoring.gscStatus} / {selectedSite.monitoring.ga4Status}</strong>
                </li>
                <li>
                  <span>Delta Impressions</span>
                  <strong>{selectedSite.monitoring.deltaFromPrevious?.impressions ?? 0}</strong>
                </li>
              </ul>
            </div>
            <div className="detail-column">
              <h3>监控历史</h3>
              <ul className="detail-list">
                {report.monitoring.historyPreview.map((run) => {
                  const siteRun = run.sites.find((item) => item.siteSlug === selectedSite.siteSlug)
                  return (
                    <li key={run.runId}>
                      <span>{run.seeded ? 'seeded' : run.runId.slice(0, 10)}</span>
                      <strong>{siteRun ? integer.format(siteRun.impressions) : 0}</strong>
                    </li>
                  )
                })}
                <li>
                  <span>Ranking source</span>
                  <strong>{selectedSite.monitoring.rankingSource}</strong>
                </li>
                <li>
                  <span>Conversion source</span>
                  <strong>{selectedSite.monitoring.conversionSource}</strong>
                </li>
              </ul>
              {selectedSite.monitoring.notes.length > 0 ? (
                <ul className="stack-list">
                  {selectedSite.monitoring.notes.map((note) => (
                    <li key={note}>
                      <p>{note}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="detail-band">
            <div className="detail-column">
              <h3>扩展关检查</h3>
              <ul className="stack-list">
                <li>
                  <strong>T+14 {selectedSite.gates.expansion.day14.status}</strong>
                  <p>
                    indexed {(selectedSite.gates.expansion.day14.indexedPageRatio * 100).toFixed(0)}% /
                    indexable {(selectedSite.gates.expansion.day14.indexablePageRatio * 100).toFixed(0)}% /
                    top-50 {selectedSite.monitoring.rankingSource === 'gsc' ? 'queries' : 'proxy'}{' '}
                    {selectedSite.gates.expansion.day14.top50KeywordCount}/
                    {selectedSite.gates.expansion.day14.trackedKeywordCount}
                  </p>
                  <p>{selectedSite.gates.expansion.day14.reason}</p>
                  <p>{selectedSite.gates.expansion.day14.nextAction}</p>
                </li>
                <li>
                  <strong>T+30 {selectedSite.gates.expansion.day30.status}</strong>
                  <p>
                    top-20 {selectedSite.monitoring.rankingSource === 'gsc' ? 'queries' : 'proxy'}{' '}
                    {selectedSite.gates.expansion.day30.top20KeywordCount}/
                    {selectedSite.gates.expansion.day30.trackedKeywordCount} / commercial{' '}
                    {selectedSite.gates.expansion.day30.hasCommercialSignal ? 'yes' : 'no'} (
                    {selectedSite.monitoring.conversionSource}) /
                    momentum {selectedSite.gates.expansion.day30.momentum}
                  </p>
                  <p>{selectedSite.gates.expansion.day30.reason}</p>
                  <p>{selectedSite.gates.expansion.day30.nextAction}</p>
                </li>
                <li>
                  <strong>Overall</strong>
                  <p>
                    {selectedSite.gates.expansion.overall} / decline checkpoints{' '}
                    {selectedSite.gates.expansion.day30.declineCheckpoints}
                  </p>
                  <p>{selectedSite.lifecycle.reason}</p>
                </li>
              </ul>
            </div>
            <div className="detail-column">
              <h3>优化动作</h3>
              <ul className="stack-list">
                {selectedSite.optimization.map((action) => (
                  <li key={action.title}>
                    <strong>{action.title}</strong>
                    <p>
                      <span className="inline-pill">{action.priority}</span> {action.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="detail-column">
              <h3>发布关检查</h3>
              <ul className="stack-list">
                <li>
                  <strong>信息差</strong>
                  <p>
                    {selectedSite.gates.publish.informationGapPass ? 'pass' : 'fail'} /
                    outdated SERP {selectedSite.gates.publish.evidence.outdatedSerpResults} /
                    forum pain {selectedSite.gates.publish.evidence.forumPainThreads}
                  </p>
                  <p>{selectedSite.gates.publish.evidence.gapOpportunities.join(' | ')}</p>
                </li>
                <li>
                  <strong>完整性</strong>
                  <p>
                    {selectedSite.gates.publish.completenessPass ? 'pass' : 'fail'} /
                    coverage {selectedSite.gates.publish.evidence.searchIntentCoverage} /
                    FAQ {selectedSite.gates.publish.evidence.faqRealQueryCoverage}
                  </p>
                  <p>
                    covered intents {selectedCoveredIntents.join(', ')} / required intents{' '}
                    {selectedSite.gates.publish.evidence.topIntents.join(', ')}
                  </p>
                </li>
                <li>
                  <strong>非模板化</strong>
                  <p>
                    {selectedSite.gates.publish.nonTemplatePass ? 'pass' : 'fail'} /
                    original anchors {selectedSite.gates.publish.evidence.originalAnchorCount} /
                    AI fluff {(selectedSite.gates.publish.evidence.aiFluffRatio * 100).toFixed(0)}%
                  </p>
                  <p>{selectedOriginalAnchors.join(' | ')}</p>
                  <p>
                    generic pages {selectedSite.gates.publish.evidence.genericPhrasePages} / AI flavor pages{' '}
                    {selectedSite.gates.publish.evidence.aiFlavorPages} / low evidence pages{' '}
                    {selectedSite.gates.publish.evidence.lowEvidencePages}
                  </p>
                </li>
                <li>
                  <strong>真实 FAQ</strong>
                  <p>
                    {selectedSite.research.faqCandidates
                      .slice(0, 4)
                      .map((item) => `${item.question} (${item.source})`)
                      .join(' | ')}
                  </p>
                </li>
                {selectedSite.audit.issues.length === 0 ? (
                  <li>
                    <strong>No open issues</strong>
                    <p>当前页面都过了自动审计基线。</p>
                  </li>
                ) : (
                  selectedSite.audit.issues.map((issue) => (
                    <li key={`${issue.path}-${issue.message}`}>
                      <strong>{issue.pageSlug}</strong>
                      <p>
                        <span className="inline-pill">{issue.severity}</span> {issue.message}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
