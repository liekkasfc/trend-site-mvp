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
  if (!hasAnyGoogleAuth()) {
    throw new Error(
      'Missing Google auth. Add GOOGLE_OAUTH_* or GOOGLE_SERVICE_ACCOUNT_* credentials before running GA4 realtime checks.',
    )
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

  const [activeUsersReport, eventsReport, titlesReport] = await Promise.all([
    runRealtimeReport(
      {
        metrics: [{ name: 'activeUsers' }],
      },
      options.propertyId,
    ),
    runRealtimeReport(
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
      options.propertyId,
    ),
    pageTitles.length > 0
      ? runRealtimeReport(
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
          options.propertyId,
        )
      : Promise.resolve({ rows: [] }),
  ])

  const activeUsers = Number.parseInt(
    activeUsersReport.rows?.[0]?.metricValues?.[0]?.value ?? '0',
    10,
  )
  const eventCounts = summarizeMetricRows(eventsReport.rows, 0, 0)
  const pageTitleViews = summarizeMetricRows(titlesReport.rows, 0, 0)
  const missingEvents = expectedEvents.filter((eventName) => (eventCounts[eventName] ?? 0) < 1)
  const matchedTitles = pageTitles.filter((title) => (pageTitleViews[title] ?? 0) >= 1)
  const pass = missingEvents.length === 0 && (pageTitles.length === 0 || matchedTitles.length >= 1)

  return {
    pass,
    propertyId: options.propertyId || process.env.GA4_PROPERTY_ID || '',
    measurementId,
    activeUsers,
    expectedEvents,
    missingEvents,
    eventCounts,
    expectedPageTitles: pageTitles,
    matchedPageTitles: matchedTitles,
    pageTitleViews,
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

  if (!result.pass && !flag(args, 'soft')) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
