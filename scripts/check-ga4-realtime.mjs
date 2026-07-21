import {
  flag,
  getAssetFilePaths,
  hasAnyGoogleAuth,
  option,
  parseArgs,
  readGaMeasurementId,
  readHtmlTitle,
  resolveSiteBaseUrl,
  runRealtimeReport,
  summarizeMetricRows,
} from './release-lib.mjs'

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function seedGa4BrowserHits(options = {}) {
  const siteSlug = options.siteSlug
  const assetSlug = options.assetSlug
  if (!siteSlug || !assetSlug) {
    throw new Error('siteSlug and assetSlug are required to seed GA4 browser hits.')
  }

  const paths = getAssetFilePaths(siteSlug, assetSlug)
  const measurementId =
    options.measurementId ||
    (await readGaMeasurementId(paths.localLandingFile)) ||
    process.env.GA4_MEASUREMENT_ID ||
    ''

  if (!measurementId) {
    throw new Error('Missing GA4 measurement ID for browser-hit seeding.')
  }

  const pageTitles = options.pageTitles?.length
    ? options.pageTitles
    : [
        await readHtmlTitle(paths.localLandingFile),
        await readHtmlTitle(paths.localThankYouFile),
      ]
  const siteBaseUrl = resolveSiteBaseUrl(options.siteBaseUrl)
  const sessionId = String(Math.floor(Date.now() / 1000))
  const clientId = `release.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}`
  const commonParams = {
    v: '2',
    tid: measurementId,
    cid: clientId,
    sid: sessionId,
    sct: '1',
    seg: '1',
    ul: 'en-us',
    sr: '1512x982',
    _fv: '1',
    _nsi: '1',
  }
  const hitPlan = [
    {
      event: 'page_view',
      url: new URL(paths.liveLandingRoute, `${siteBaseUrl}/`).toString(),
      title: pageTitles[0] ?? '',
    },
    {
      event: 'page_view',
      url: new URL(paths.publicThankYouPath, `${siteBaseUrl}/`).toString(),
      title: pageTitles[1] ?? pageTitles[0] ?? '',
    },
    {
      event: 'asset_cta_click',
      url: new URL(paths.liveLandingRoute, `${siteBaseUrl}/`).toString(),
      title: pageTitles[0] ?? '',
    },
    {
      event: 'asset_form_submit',
      url: new URL(paths.liveLandingRoute, `${siteBaseUrl}/`).toString(),
      title: pageTitles[0] ?? '',
    },
    {
      event: 'generate_lead',
      url: new URL(paths.publicThankYouPath, `${siteBaseUrl}/`).toString(),
      title: pageTitles[1] ?? pageTitles[0] ?? '',
    },
    {
      event: 'asset_delivery',
      url: new URL(paths.publicThankYouPath, `${siteBaseUrl}/`).toString(),
      title: pageTitles[1] ?? pageTitles[0] ?? '',
    },
  ]

  const responses = []
  for (const hit of hitPlan) {
    const url = new URL('https://www.google-analytics.com/g/collect')
    Object.entries({
      ...commonParams,
      dl: hit.url,
      dt: hit.title,
      en: hit.event,
    }).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, String(value))
    })
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    responses.push({
      event: hit.event,
      status: response.status,
      url: hit.url,
      title: hit.title,
    })
  }

  if (options.settleMs && options.settleMs > 0) {
    await sleep(options.settleMs)
  }

  return {
    measurementId,
    clientId,
    sessionId,
    hits: responses,
  }
}

export async function runGa4RealtimeCheck(options = {}) {
  const checkedAt = new Date().toISOString()
  const waitMs = Number(options.waitMs ?? options.settleMs ?? 0)
  const googleAuthConfigured = options.hasGoogleAuth ?? hasAnyGoogleAuth()
  if (!googleAuthConfigured) {
    return {
      pass: false,
      status: 'skipped',
      checkedAt,
      waitMs,
      reason: 'Missing Google auth. Add GOOGLE_OAUTH_* or GOOGLE_SERVICE_ACCOUNT_* credentials before running GA4 realtime checks.',
      finalJudgement: 'GA4 realtime validation was skipped because Google authentication is not configured.',
      missingEvents: [],
    }
  }

  const expectedEvents = options.expectedEvents?.length
    ? options.expectedEvents
    : ['asset_cta_click', 'asset_form_submit', 'generate_lead', 'asset_delivery']

  const pageTitles = options.pageTitles?.length
    ? options.pageTitles
    : await (async () => {
        if (!options.siteSlug || !options.assetSlug) return []
        const paths = getAssetFilePaths(options.siteSlug, options.assetSlug)
        return [
          await readHtmlTitle(paths.localLandingFile),
          await readHtmlTitle(paths.localThankYouFile),
        ]
      })()

  const measurementId =
    options.measurementId ||
    (options.siteSlug && options.assetSlug
      ? await readGaMeasurementId(getAssetFilePaths(options.siteSlug, options.assetSlug).localLandingFile)
      : process.env.GA4_MEASUREMENT_ID ?? '')

  const propertyId = options.propertyId || process.env.GA4_PROPERTY_ID || ''
  if (!propertyId) {
    return {
      pass: false,
      status: 'skipped',
      checkedAt,
      waitMs,
      propertyId: '',
      measurementId,
      expectedEvents,
      missingEvents: expectedEvents,
      reason: 'GA4_PROPERTY_ID is not configured.',
      finalJudgement: 'GA4 realtime validation was skipped because GA4_PROPERTY_ID is not configured.',
    }
  }

  let activeUsersReport
  let eventsReport
  let titlesReport
  const realtimeReporter = options.realtimeReporter ?? runRealtimeReport
  try {
    ;[activeUsersReport, eventsReport, titlesReport] = await Promise.all([
    realtimeReporter(
      {
        metrics: [{ name: 'activeUsers' }],
      },
      propertyId,
    ),
    realtimeReporter(
      {
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: expectedEvents,
              caseSensitive: false,
            },
          },
        },
        limit: String(Math.max(expectedEvents.length, 1)),
      },
      propertyId,
    ),
    pageTitles.length > 0
        ? realtimeReporter(
          {
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'screenPageViews' }],
            dimensionFilter: {
              filter: {
                fieldName: 'unifiedScreenName',
                inListFilter: {
                  values: pageTitles,
                  caseSensitive: false,
                },
              },
            },
            limit: String(Math.max(pageTitles.length, 1)),
          },
          propertyId,
        )
      : Promise.resolve({ rows: [] }),
    ])
  } catch (error) {
    return {
      pass: false,
      status: 'fail',
      checkedAt,
      waitMs,
      propertyId,
      measurementId,
      expectedEvents,
      missingEvents: expectedEvents,
      error: error instanceof Error ? error.message : String(error),
      finalJudgement: 'GA4 realtime validation failed because the Analytics Data API request did not succeed.',
    }
  }

  const activeUsers = Number.parseInt(
    activeUsersReport.rows?.[0]?.metricValues?.[0]?.value ?? '0',
    10,
  )
  const eventCounts = summarizeMetricRows(eventsReport.rows, 0, 0)
  const pageTitleViews = summarizeMetricRows(titlesReport.rows, 0, 0)
  const missingEvents = expectedEvents.filter((eventName) => (eventCounts[eventName] ?? 0) < 1)
  const matchedTitles = pageTitles.filter((title) => (pageTitleViews[title] ?? 0) >= 1)
  const pass = missingEvents.length === 0 && (pageTitles.length === 0 || matchedTitles.length >= 1)
  const status = pass ? 'pass' : measurementId ? 'delayed' : 'warning'

  return {
    pass,
    status,
    checkedAt,
    waitMs,
    propertyId,
    measurementId,
    activeUsers,
    expectedEvents,
    missingEvents,
    eventCounts,
    expectedPageTitles: pageTitles,
    matchedPageTitles: matchedTitles,
    pageTitleViews,
    finalJudgement:
      status === 'pass'
        ? 'Confirmed target realtime events.'
        : status === 'delayed'
          ? 'Realtime API responded, but target events or page titles have not appeared yet.'
          : 'GA4 is partially configured, but the measurement stream could not be fully validated.',
  }
}

async function main() {
  const args = parseArgs()
  const result = await runGa4RealtimeCheck({
    propertyId: option(args, 'property-id'),
    measurementId: option(args, 'measurement-id'),
    siteSlug: option(args, 'site-slug'),
    assetSlug: option(args, 'asset-slug'),
    expectedEvents: option(args, 'events')
      ? option(args, 'events')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined,
    pageTitles: option(args, 'page-titles')
      ? option(args, 'page-titles')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined,
  })

  console.log(JSON.stringify(result, null, 2))

  if (result.status === 'fail' && !flag(args, 'soft')) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
