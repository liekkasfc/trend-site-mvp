import path from 'node:path'
import {
  getGoogleAccessToken,
  loadProjectEnv,
  projectRoot,
  readJsonIfExists,
  writeJson,
} from './release-lib.mjs'

loadProjectEnv()

const generatedDir = path.join(projectRoot, 'public', 'generated')
const monitoringHistoryPath = path.join(generatedDir, 'monitoring-history.json')
const pipelineReportPath = path.join(generatedDir, 'pipeline-report.json')
const liveRefreshReportPath = path.join(generatedDir, 'live-monitoring-refresh.json')

const baseUrl = process.env.SITE_BASE_URL ?? 'https://automiora.com'
const gscSiteUrl = String(process.env.GSC_SITE_URL ?? '').trim()
const ga4PropertyId = String(process.env.GA4_PROPERTY_ID ?? '').replace(/^properties\//, '').trim()
const gscLookbackDays = Number.parseInt(process.env.GSC_LOOKBACK_DAYS ?? '30', 10) || 30
const ga4LookbackDays = Number.parseInt(process.env.GA4_LOOKBACK_DAYS ?? '30', 10) || 30
const affiliateFeatureEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.AFFILIATE_FEATURE_ENABLED ?? '').trim().toLowerCase(),
)
const ga4ConversionEvents = String(process.env.GA4_CONVERSION_EVENTS ?? 'generate_lead,sign_up,purchase,affiliate_click')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const siteSlug = 'ai-video-workflow-short-form-demo'
const commercialPublicPaths = [
  '/guides/ai-video-diy-vs-freelancer/',
  '/cost/ai-video-production-cost/',
  '/hire/ai-video-editor/',
]
const publicPaths = [
  '/',
  '/workflow/',
  '/compare/',
  '/prompt-pack/',
  '/audit/',
  ...(affiliateFeatureEnabled ? commercialPublicPaths : []),
]
const contentUrls = publicPaths.map((routePath) => new URL(routePath, `${baseUrl}/`).toString())

function meaningfulText(value) {
  return String(value ?? '').trim()
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildGa4RouteRegex(routePaths, { allowQueryString = false } = {}) {
  const patterns = [...new Set(routePaths)]
    .map((routePath) => meaningfulText(routePath))
    .filter(Boolean)
    .map((routePath) => {
      const escaped = escapeRegex(routePath)
      return allowQueryString ? `${escaped}(?:\\?.*)?` : escaped
    })
  return patterns.length > 0 ? `^(?:${patterns.join('|')})$` : '^/$'
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

function hasAnyGoogleAuth() {
  return Boolean(
    meaningfulText(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
      meaningfulText(process.env.GOOGLE_OAUTH_CLIENT_SECRET) &&
      meaningfulText(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
  ) || Boolean(
    meaningfulText(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
      meaningfulText(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  )
}

function getGoogleAuthMissingNote() {
  return 'Add GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN, or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
}

async function fetchWithRetry(url, init, retries = 2) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed')
}

async function fetchGoogleJson(url, payload, scopes) {
  const accessToken = await getGoogleAccessToken(scopes)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrendSitePipeline/1.0',
      },
      body: JSON.stringify(payload),
    })
    const json = await response.json().catch(() => ({}))
    if (response.ok) {
      return json
    }

    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      continue
    }

    throw new Error(`${response.status} ${JSON.stringify(json)}`)
  }
  throw new Error('Unreachable Google API retry state')
}

async function fetchGscSiteMetrics() {
  if (!hasAnyGoogleAuth()) {
    return {
      status: 'missing_credentials',
      notes: [getGoogleAuthMissingNote()],
    }
  }

  if (!gscSiteUrl) {
    return {
      status: 'missing_config',
      notes: ['Set GSC_SITE_URL to the verified Search Console property.'],
    }
  }

  const range = buildDateRange(gscLookbackDays, 2)
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    gscSiteUrl,
  )}/searchAnalytics/query`

  try {
    const pageReports = await Promise.all(
      contentUrls.map(async (pageUrl) => {
        const dimensionFilterGroups = [
          {
            filters: [
              {
                dimension: 'page',
                operator: 'equals',
                expression: pageUrl,
              },
            ],
          },
        ]

        const [totals, queries] = await Promise.all([
          fetchGoogleJson(
            endpoint,
            { startDate: range.startDate, endDate: range.endDate, dimensionFilterGroups },
            ['https://www.googleapis.com/auth/webmasters.readonly'],
          ),
          fetchGoogleJson(
            endpoint,
            {
              startDate: range.startDate,
              endDate: range.endDate,
              dimensionFilterGroups,
              dimensions: ['query'],
              rowLimit: 25000,
            },
            ['https://www.googleapis.com/auth/webmasters.readonly'],
          ),
        ])

        return {
          pageUrl,
          totalsRow: totals.rows?.[0] ?? null,
          queryRows: queries.rows ?? [],
        }
      }),
    )

    let impressions = 0
    let clicks = 0
    let weightedPositionSum = 0
    const queryMap = new Map()

    for (const report of pageReports) {
      const rowImpressions = Number(report.totalsRow?.impressions ?? 0)
      const rowClicks = Number(report.totalsRow?.clicks ?? 0)
      const rowPosition = Number(report.totalsRow?.position ?? 0)
      impressions += rowImpressions
      clicks += rowClicks
      weightedPositionSum += rowImpressions > 0 ? rowPosition * rowImpressions : 0

      for (const row of report.queryRows) {
        const query = meaningfulText(row.keys?.[0])
        if (!query) continue
        const previous = queryMap.get(query) ?? {
          impressions: 0,
          clicks: 0,
          weightedPositionSum: 0,
        }
        const queryImpressions = Number(row.impressions ?? 0)
        previous.impressions += queryImpressions
        previous.clicks += Number(row.clicks ?? 0)
        previous.weightedPositionSum += Number(row.position ?? 0) * queryImpressions
        queryMap.set(query, previous)
      }
    }

    const queries = [...queryMap.entries()]
      .map(([query, row]) => ({
        query,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.impressions > 0 ? row.weightedPositionSum / row.impressions : 100,
      }))
      .sort((left, right) => right.impressions - left.impressions)

    return {
      status: impressions > 0 || clicks > 0 || queries.length > 0 ? 'live' : 'no_data',
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      ctr: impressions > 0 ? round(clicks / impressions, 4) : 0,
      avgPosition: impressions > 0 ? round(weightedPositionSum / impressions, 1) : 100,
      rankingQueryCount: queries.length,
      liveTop50KeywordCount: queries.filter((row) => row.position <= 50).length,
      liveTop20KeywordCount: queries.filter((row) => row.position <= 20).length,
      topQueries: queries.slice(0, 10),
      notes:
        queries.length === 0
          ? [`GSC returned no public-page query rows across ${gscLookbackDays} days.`]
          : [],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown GSC error',
      notes: [
        `GSC request failed for ${contentUrls.length || 0} public page(s); monitoring refresh is falling back to the previous ranking snapshot.`,
      ],
    }
  }
}

async function fetchGa4SiteMetrics() {
  if (!hasAnyGoogleAuth()) {
    return {
      status: 'missing_credentials',
      notes: [getGoogleAuthMissingNote()],
    }
  }

  if (!ga4PropertyId) {
    return {
      status: 'missing_config',
      notes: ['Set GA4_PROPERTY_ID to the Analytics property that tracks this site.'],
    }
  }

  const range = buildDateRange(ga4LookbackDays)
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4PropertyId}:runReport`

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
                matchType: 'FULL_REGEXP',
                value: buildGa4RouteRegex(publicPaths, { allowQueryString: true }),
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
                      matchType: 'FULL_REGEXP',
                      value: buildGa4RouteRegex(publicPaths),
                    },
                  },
                },
                {
                  filter: {
                    fieldName: 'eventName',
                    inListFilter: {
                      values: ga4ConversionEvents,
                      caseSensitive: false,
                    },
                  },
                },
              ],
            },
          },
          limit: String(Math.max(ga4ConversionEvents.length, 1)),
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
                matchType: 'FULL_REGEXP',
                value: buildGa4RouteRegex(publicPaths),
              },
            },
          },
          limit: '250',
        },
        ['https://www.googleapis.com/auth/analytics.readonly'],
      ),
    ])

    const sumRows = (rows, metricIndex = 0) =>
      round(
        (rows ?? []).reduce(
          (sum, row) => sum + Number.parseFloat(row.metricValues?.[metricIndex]?.value ?? '0'),
          0,
        ),
        2,
      )

    const sessions = Math.round(sumRows(sessionsReport.rows))
    const conversions = Math.round(sumRows(conversionsReport.rows))
    const revenue = sumRows(revenueReport.rows)

    return {
      status: sessions > 0 || conversions > 0 || revenue > 0 ? 'live' : 'no_data',
      sessions,
      conversions,
      revenue,
      notes:
        sessions === 0 && conversions === 0 && revenue === 0
          ? [`GA4 returned no sessions or conversion events across ${ga4LookbackDays} days.`]
          : [],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown GA4 error',
      notes: [
        `GA4 request failed for ${publicPaths.length || 0} public route(s); monitoring refresh is falling back to the previous conversion snapshot.`,
      ],
    }
  }
}

function fallbackMetricValue(candidateValue, previousValue, fallbackValue) {
  if (candidateValue !== undefined && candidateValue !== null) return candidateValue
  if (previousValue !== undefined && previousValue !== null) return previousValue
  return fallbackValue
}

function buildHistoryEntry(previousSiteRecord, gscMetrics, ga4Metrics) {
  const generatedAt = new Date().toISOString()
  const useLiveGsc = ['live', 'no_data'].includes(gscMetrics.status)
  const useLiveGa4 = ['live', 'no_data'].includes(ga4Metrics.status)
  const mode =
    useLiveGsc && useLiveGa4
      ? 'live_google'
      : useLiveGsc || useLiveGa4
        ? 'hybrid_google'
        : 'heuristic_forecast'

  const impressions = fallbackMetricValue(gscMetrics.impressions, previousSiteRecord?.impressions, 0)
  const clicks = fallbackMetricValue(gscMetrics.clicks, previousSiteRecord?.clicks, 0)
  const ctr = fallbackMetricValue(gscMetrics.ctr, previousSiteRecord?.ctr, 0)
  const avgPosition = fallbackMetricValue(gscMetrics.avgPosition, previousSiteRecord?.avgPosition, 100)
  const sessions = fallbackMetricValue(ga4Metrics.sessions, previousSiteRecord?.sessions, 0)
  const conversions = fallbackMetricValue(ga4Metrics.conversions, previousSiteRecord?.conversions, 0)
  const revenue = fallbackMetricValue(ga4Metrics.revenue, previousSiteRecord?.revenue, 0)

  const siteRecord = {
    siteSlug,
    mode,
    impressions,
    clicks,
    ctr,
    avgPosition,
    conversions,
    conversionRate: sessions > 0 ? round(conversions / sessions, 4) : 0,
    revenue,
    sessions,
    rankingSource: useLiveGsc ? 'gsc' : previousSiteRecord?.rankingSource ?? 'proxy',
    conversionSource: useLiveGa4 ? 'ga4' : previousSiteRecord?.conversionSource ?? 'forecast',
    rankingQueryCount: fallbackMetricValue(gscMetrics.rankingQueryCount, previousSiteRecord?.rankingQueryCount, 0),
    liveTop50KeywordCount: fallbackMetricValue(gscMetrics.liveTop50KeywordCount, previousSiteRecord?.liveTop50KeywordCount, 0),
    liveTop20KeywordCount: fallbackMetricValue(gscMetrics.liveTop20KeywordCount, previousSiteRecord?.liveTop20KeywordCount, 0),
    gscStatus: gscMetrics.status,
    ga4Status: ga4Metrics.status,
    gscLookbackDays,
    ga4LookbackDays,
    conversionEvents: ga4ConversionEvents,
    notes: [...(gscMetrics.notes ?? []), ...(ga4Metrics.notes ?? [])],
    deltaFromPrevious: {
      impressions: Math.round(impressions - Number(previousSiteRecord?.impressions ?? 0)),
      clicks: Math.round(clicks - Number(previousSiteRecord?.clicks ?? 0)),
      avgPosition: round(avgPosition - Number(previousSiteRecord?.avgPosition ?? 0), 1),
      conversions: Math.round(conversions - Number(previousSiteRecord?.conversions ?? 0)),
      revenue: round(revenue - Number(previousSiteRecord?.revenue ?? 0), 2),
    },
  }

  return {
    runId: generatedAt.replaceAll(':', '-').replaceAll('.', '-'),
    generatedAt,
    mode,
    seeded: false,
    sites: [siteRecord],
  }
}

function updatePipelineReport(pipelineReport, history) {
  if (!pipelineReport) return null

  const currentRun = history.at(-1) ?? null
  const liveRankingSites = currentRun?.sites?.filter((site) => site.rankingSource === 'gsc').length ?? 0
  const liveConversionSites = currentRun?.sites?.filter((site) => site.conversionSource === 'ga4').length ?? 0
  const totalImpressions = currentRun?.sites?.reduce((sum, site) => sum + Number(site.impressions ?? 0), 0) ?? 0
  const monitoringStage = Array.isArray(pipelineReport.stages)
    ? pipelineReport.stages.find((stage) => stage.key === 'data-monitoring')
    : null

  pipelineReport.monitoring = {
    ...(pipelineReport.monitoring ?? {}),
    mode: currentRun?.mode ?? pipelineReport.monitoring?.mode ?? 'heuristic_forecast',
    currentRun,
    historyPreview: history.slice(-6),
    liveRefreshGeneratedAt: currentRun?.generatedAt ?? new Date().toISOString(),
  }

  if (monitoringStage) {
    monitoringStage.summary = `已写入 ${history.length} 次运行快照，${liveRankingSites}/1 个站点使用 GSC 排名，${liveConversionSites}/1 个站点使用 GA4 转化`
    monitoringStage.metrics = {
      ...(monitoringStage.metrics ?? {}),
      historyRuns: history.length,
      totalImpressions,
      liveRankingSites,
      liveConversionSites,
    }
  }

  return pipelineReport
}

async function main() {
  const [historySnapshot, pipelineReport] = await Promise.all([
    readJsonIfExists(monitoringHistoryPath, { generatedAt: new Date().toISOString(), history: [] }),
    readJsonIfExists(pipelineReportPath, null),
  ])

  const previousSiteRecord = historySnapshot.history?.at(-1)?.sites?.find((site) => site.siteSlug === siteSlug) ?? null
  const [gscMetrics, ga4Metrics] = await Promise.all([fetchGscSiteMetrics(), fetchGa4SiteMetrics()])
  const currentRun = buildHistoryEntry(previousSiteRecord, gscMetrics, ga4Metrics)
  const history = [...(historySnapshot.history ?? []), currentRun].slice(-6)

  await writeJson(monitoringHistoryPath, {
    generatedAt: currentRun.generatedAt,
    history,
  })

  const nextPipelineReport = updatePipelineReport(pipelineReport, history)
  if (nextPipelineReport) {
    await writeJson(pipelineReportPath, nextPipelineReport)
  }

  await writeJson(liveRefreshReportPath, {
    generatedAt: currentRun.generatedAt,
    siteSlug,
    baseUrl,
    monitoredPaths: publicPaths,
    currentRun,
    gsc: gscMetrics,
    ga4: ga4Metrics,
  })

  console.log(
    JSON.stringify(
      {
        status: gscMetrics.status === 'error' || ga4Metrics.status === 'error' ? 'partial' : 'ok',
        monitoringMode: currentRun.mode,
        generatedAt: currentRun.generatedAt,
        monitoringHistoryPath,
        pipelineReportPath,
        liveRefreshReportPath,
        gscStatus: gscMetrics.status,
        ga4Status: ga4Metrics.status,
        impressions: currentRun.sites[0]?.impressions ?? 0,
        sessions: currentRun.sites[0]?.sessions ?? 0,
        conversions: currentRun.sites[0]?.conversions ?? 0,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
