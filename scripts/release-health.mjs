import path from 'node:path'

import {
  createReleaseRunDirectory,
  getAssetFilePaths,
  getDefaultAssetSlug,
  getDefaultSiteSlug,
  option,
  parseArgs,
  projectRoot,
  resolveApiBaseUrl,
  resolveSiteBaseUrl,
  trimTrailingSlash,
  writeJson,
  writeText,
} from './release-lib.mjs'

async function checkUrl(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    redirect: 'follow',
  })

  const bodyText =
    options.readBody === false ? '' : await response.text().catch(() => '')

  return {
    url,
    method: options.method ?? 'GET',
    status: response.status,
    ok: response.ok,
    bodyPreview: bodyText.slice(0, 240),
    contentType: response.headers.get('content-type') ?? '',
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Release Health',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Site base URL: ${report.siteBaseUrl}`,
    `- API base URL: ${report.apiBaseUrl}`,
    `- Overall status: ${report.overallStatus}`,
    '',
    '## Checks',
  ]

  for (const check of report.checks) {
    lines.push(`- ${check.label}: ${check.ok ? 'pass' : 'fail'} (${check.status})`)
    lines.push(`  - ${check.url}`)
    if (check.note) lines.push(`  - ${check.note}`)
  }

  return `${lines.join('\n')}\n`
}

export async function runReleaseHealth(options = {}) {
  const siteSlug = options.siteSlug || getDefaultSiteSlug()
  const assetSlug = options.assetSlug || getDefaultAssetSlug()
  const siteBaseUrl = resolveSiteBaseUrl(options.siteBaseUrl)
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl)
  const assetPaths = getAssetFilePaths(siteSlug, assetSlug)
  const checks = []

  const root = await checkUrl(trimTrailingSlash(siteBaseUrl))
  checks.push({
    label: 'Site root',
    ...root,
    note: root.bodyPreview.includes('Redirecting') ? 'Root redirect shell is present.' : '',
  })

  const landing = await checkUrl(`${trimTrailingSlash(siteBaseUrl)}${assetPaths.liveLandingRoute}`)
  checks.push({
    label: 'Primary asset landing',
    ...landing,
    note: landing.bodyPreview.includes('Request the asset') ? 'Lead capture shell rendered.' : '',
  })

  const sitemap = await checkUrl(`${trimTrailingSlash(siteBaseUrl)}/sitemap.xml`)
  checks.push({
    label: 'Sitemap',
    ...sitemap,
    note: sitemap.bodyPreview.includes('<urlset') ? 'Sitemap XML rendered.' : '',
  })

  const robots = await checkUrl(`${trimTrailingSlash(siteBaseUrl)}/robots.txt`)
  checks.push({
    label: 'Robots',
    ...robots,
    note: robots.bodyPreview.includes('Sitemap:') ? 'Robots references sitemap.' : '',
  })

  const llms = await checkUrl(`${trimTrailingSlash(siteBaseUrl)}/llms.txt`)
  checks.push({
    label: 'LLMs',
    ...llms,
    note: llms.bodyPreview.includes('Trend Site Pipeline') ? 'LLMs manifest rendered.' : '',
  })

  const apiHealth = await checkUrl(`${trimTrailingSlash(apiBaseUrl)}/health`)
  checks.push({
    label: 'API health',
    ...apiHealth,
    note: apiHealth.bodyPreview.includes('"ok": true') ? 'Worker health route is live.' : '',
  })

  return {
    generatedAt: new Date().toISOString(),
    siteSlug,
    assetSlug,
    siteBaseUrl,
    apiBaseUrl,
    checks,
    overallStatus: checks.every((check) => check.ok) ? 'pass' : 'fail',
  }
}

async function main() {
  const args = parseArgs()
  const runDirectory = await createReleaseRunDirectory('release-health')
  const report = await runReleaseHealth({
    siteSlug: option(args, 'site-slug'),
    assetSlug: option(args, 'asset-slug'),
    siteBaseUrl: option(args, 'site-base-url'),
    apiBaseUrl: option(args, 'api-base-url'),
  })

  const markdown = renderMarkdown(report)
  const artifacts = {
    runDirectory,
    jsonReport: path.join(runDirectory, 'release-health.json'),
    markdownReport: path.join(runDirectory, 'release-health.md'),
    latestJson: path.join(projectRoot, 'public', 'generated', 'release-health.json'),
    latestMarkdown: path.join(projectRoot, 'storage', 'release-health.md'),
  }

  await writeJson(artifacts.jsonReport, report)
  await writeText(artifacts.markdownReport, markdown)
  await writeJson(artifacts.latestJson, report)
  await writeText(artifacts.latestMarkdown, markdown)

  console.log(JSON.stringify({ ...report, artifacts }, null, 2))

  if (report.overallStatus !== 'pass') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
