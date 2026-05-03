import path from 'node:path'

import {
  createReleaseRunDirectory,
  getGoogleAccessToken,
  hasAnyGoogleAuth,
  parseArgs,
  projectRoot,
  readJsonIfExists,
  resolveSiteBaseUrl,
  trimTrailingSlash,
  writeJson,
  writeText,
} from './release-lib.mjs'

const generatedDir = path.join(projectRoot, 'public', 'generated')
const storageDir = path.join(projectRoot, 'storage')

function getIndexNowConfig(baseUrl) {
  const key = (process.env.INDEXNOW_KEY ?? '').trim()
  const host =
    (process.env.INDEXNOW_HOST ?? '').trim() ||
    new URL(resolveSiteBaseUrl(baseUrl)).hostname.replace(/^www\./i, '')
  const keyLocation =
    (process.env.INDEXNOW_KEY_LOCATION ?? '').trim() ||
    `${trimTrailingSlash(resolveSiteBaseUrl(baseUrl))}/${key}.txt`

  return {
    key,
    host,
    keyLocation,
    enabled: Boolean(key && host),
  }
}

async function submitGoogleSitemap(siteUrl, sitemapUrl) {
  const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/webmasters'])
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Length': '0',
    },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }

  return {
    status: 'submitted',
    endpoint,
    sitemapUrl,
  }
}

async function submitIndexNow(urls, config) {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      host: config.host,
      key: config.key,
      keyLocation: config.keyLocation,
      urlList: urls,
    }),
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }

  return {
    status: 'submitted',
    host: config.host,
    keyLocation: config.keyLocation,
    submittedUrls: urls.length,
  }
}

function renderMarkdown(report) {
  const lines = [
    '# SEO Submission',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- Overall status: ${report.overallStatus}`,
    `- Queued URLs: ${report.queueSize}`,
    '',
    '## Engines',
  ]

  for (const engine of report.engines) {
    lines.push(`- ${engine.label}: ${engine.status}`)
    if (engine.note) lines.push(`  - ${engine.note}`)
  }

  if (report.queuePreview.length > 0) {
    lines.push('')
    lines.push('## Queue preview')
    for (const url of report.queuePreview) {
      lines.push(`- ${url}`)
    }
  }

  return `${lines.join('\n')}\n`
}

export async function runSeoSubmit() {
  const seoReport = await readJsonIfExists(path.join(generatedDir, 'seo-report.json'), null)
  if (!seoReport) {
    throw new Error('Missing public/generated/seo-report.json. Run the pipeline first.')
  }

  const baseUrl = resolveSiteBaseUrl(seoReport.baseUrl)
  const queuedUrls = Array.isArray(seoReport.queuedUrls) ? seoReport.queuedUrls : []
  const localBase = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[:/]/i.test(baseUrl)
  const indexNow = getIndexNowConfig(baseUrl)
  const gscSiteUrl = (process.env.GSC_SITE_URL ?? '').trim()

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sitemapUrl: seoReport.sitemapUrl,
    queueSize: queuedUrls.length,
    queuePreview: queuedUrls.slice(0, 10),
    engines: [],
    overallStatus: 'prepared',
  }

  if (queuedUrls.length === 0) {
    report.engines.push({
      key: 'queue',
      label: 'Submission queue',
      status: 'blocked_gate2',
      note: 'No releasable URLs are queued yet.',
    })
    return report
  }

  if (localBase) {
    report.engines.push({
      key: 'local-base-url',
      label: 'Submission queue',
      status: 'prepared',
      note: 'Local base URL detected, so live engine submission is skipped.',
    })
    return report
  }

  if (gscSiteUrl && hasAnyGoogleAuth()) {
    try {
      const google = await submitGoogleSitemap(gscSiteUrl, seoReport.sitemapUrl)
      report.engines.push({
        key: 'google-search-console',
        label: 'Google Search Console sitemap submit',
        status: google.status,
        note: `Submitted sitemap ${google.sitemapUrl}.`,
      })
    } catch (error) {
      report.engines.push({
        key: 'google-search-console',
        label: 'Google Search Console sitemap submit',
        status: 'error',
        note: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    report.engines.push({
      key: 'google-search-console',
      label: 'Google Search Console sitemap submit',
      status: 'needs_credentials',
      note: 'Set GSC_SITE_URL and Google OAuth or service-account credentials.',
    })
  }

  if (indexNow.enabled) {
    try {
      const submitted = await submitIndexNow(queuedUrls, indexNow)
      report.engines.push({
        key: 'indexnow',
        label: 'IndexNow',
        status: submitted.status,
        note: `Submitted ${submitted.submittedUrls} URL(s) for ${submitted.host}.`,
      })
    } catch (error) {
      report.engines.push({
        key: 'indexnow',
        label: 'IndexNow',
        status: 'error',
        note: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    report.engines.push({
      key: 'indexnow',
      label: 'IndexNow',
      status: 'needs_key',
      note: 'Set INDEXNOW_KEY and INDEXNOW_HOST to push live URL notifications.',
    })
  }

  report.overallStatus = report.engines.every((engine) => engine.status === 'submitted')
    ? 'pass'
    : report.engines.some((engine) => engine.status === 'submitted')
      ? 'partial'
      : 'warning'

  return report
}

async function main() {
  parseArgs()
  const runDirectory = await createReleaseRunDirectory('seo-submit')
  const previousState = await readJsonIfExists(path.join(storageDir, 'seo-submissions.json'), {
    history: [],
  })
  const report = await runSeoSubmit()
  const entry = {
    ...report,
    runDirectory,
  }
  const history = [...(previousState?.history ?? []), entry].slice(-20)
  const state = {
    updatedAt: report.generatedAt,
    latest: entry,
    history,
  }
  const markdown = renderMarkdown(report)
  const artifacts = {
    runDirectory,
    jsonReport: path.join(runDirectory, 'seo-submit.json'),
    markdownReport: path.join(runDirectory, 'seo-submit.md'),
    stateJson: path.join(storageDir, 'seo-submissions.json'),
    stateMarkdown: path.join(storageDir, 'seo-submissions.md'),
    publicStateJson: path.join(projectRoot, 'public', 'generated', 'seo-submission-state.json'),
  }

  await writeJson(artifacts.jsonReport, report)
  await writeText(artifacts.markdownReport, markdown)
  await writeJson(artifacts.stateJson, state)
  await writeText(artifacts.stateMarkdown, markdown)
  await writeJson(artifacts.publicStateJson, state)

  console.log(JSON.stringify({ ...report, artifacts }, null, 2))

  if (report.overallStatus === 'warning') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
