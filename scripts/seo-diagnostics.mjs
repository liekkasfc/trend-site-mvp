import path from 'node:path'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'

import {
  createReleaseRunDirectory,
  projectRoot,
  readJsonIfExists,
  resolveSiteBaseUrl,
  trimTrailingSlash,
  writeJson,
  writeText,
} from './release-lib.mjs'

const generatedDir = path.join(projectRoot, 'public', 'generated')
const defaultPublicDir = path.join(projectRoot, 'public')

function extractTagContent(html, pattern) {
  return html.match(pattern)?.[1]?.trim() ?? ''
}

export async function resolvePublicRouteFile(publicDir, routePath) {
  const pathname = new URL(routePath, 'https://automiora.invalid').pathname
  const normalized = pathname.replace(/^\/+|\/+$/g, '')
  const directPath = pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, normalized)

  try {
    const directStat = await stat(directPath)
    if (directStat.isFile()) return directPath
    if (directStat.isDirectory()) {
      const indexPath = path.join(directPath, 'index.html')
      const indexStat = await stat(indexPath).catch(() => null)
      if (indexStat?.isFile()) return indexPath
      throw new Error(`SEO route ${pathname} resolved to ${indexPath}, but the directory has no index.html`)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const indexPath = pathname === '/' ? directPath : path.join(directPath, 'index.html')
  throw new Error(`SEO route ${pathname} resolved to missing public file ${indexPath}`)
}

export async function readPublicRouteHtml(url, baseUrl, options = {}) {
  const pathname = new URL(url).pathname
  const publicDir = options.publicDir ?? defaultPublicDir
  let filePath
  try {
    filePath = await resolvePublicRouteFile(publicDir, pathname)
  } catch (error) {
    return {
      exists: false,
      filePath: path.join(publicDir, pathname.replace(/^\/+|\/+$/g, ''), 'index.html'),
      html: '',
      pathname,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  return {
    exists: true,
    filePath,
    html: await readFile(filePath, 'utf8'),
    pathname,
    isLocalBaseUrl: resolveSiteBaseUrl(baseUrl).startsWith('http://localhost'),
  }
}

async function buildPageDiagnostics(urls, sitemapUrl, robotsUrl, baseUrl) {
  const diagnostics = []
  const sitemapBody = existsSync(path.join(projectRoot, 'public', 'sitemap.xml'))
    ? await readFile(path.join(projectRoot, 'public', 'sitemap.xml'), 'utf8')
    : ''
  const robotsBody = existsSync(path.join(projectRoot, 'public', 'robots.txt'))
    ? await readFile(path.join(projectRoot, 'public', 'robots.txt'), 'utf8')
    : ''

  for (const url of urls) {
    const page = await readPublicRouteHtml(url, baseUrl)
    const title = extractTagContent(page.html, /<title>([^<]*)<\/title>/i)
    const description = extractTagContent(
      page.html,
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/i,
    )
    const canonical = extractTagContent(
      page.html,
      /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i,
    )
    const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(page.html)
    const schemaCount = (page.html.match(/application\/ld\+json/g) ?? []).length
    const internalLinkCount = (page.html.match(/<a /g) ?? []).length

    diagnostics.push({
      url,
      pathname: page.pathname,
      filePath: page.filePath,
      fileExists: page.exists,
      error: page.error ?? '',
      title,
      titleLength: title.length,
      descriptionLength: description.length,
      canonical,
      canonicalMatches: canonical === url,
      schemaCount,
      internalLinkCount,
      inSitemap: sitemapBody.includes(url),
      inRobotsContext: robotsBody.includes(sitemapUrl) && robotsBody.includes('Allow: /'),
      noindex,
      checks: {
        hasTitle: Boolean(title),
        hasDescription: Boolean(description),
        hasCanonical: Boolean(canonical),
        hasSchema: schemaCount > 0,
        hasEnoughInternalLinks: internalLinkCount >= 3,
        isIndexable: !noindex,
      },
    })
  }

  return diagnostics
}

function renderMarkdown(report) {
  const lines = [
    '# SEO Diagnostics',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- Overall status: ${report.overallStatus}`,
    `- Queue size: ${report.summary.queuedUrls}`,
    '',
    '## Root assets',
  ]

  lines.push(`- Sitemap file present: ${report.rootAssets.sitemapPresent ? 'yes' : 'no'}`)
  lines.push(`- Robots file present: ${report.rootAssets.robotsPresent ? 'yes' : 'no'}`)
  lines.push(`- llms.txt present: ${report.rootAssets.llmsPresent ? 'yes' : 'no'}`)

  lines.push('')
  lines.push('## Pages')
  for (const page of report.pages) {
    lines.push(`- ${page.pathname}: ${page.fileExists ? 'file' : 'missing'} | canonical ${page.canonicalMatches ? 'ok' : 'mismatch'} | schema ${page.schemaCount} | links ${page.internalLinkCount}`)
  }

  return `${lines.join('\n')}\n`
}

export async function runSeoDiagnostics() {
  const seoReport = await readJsonIfExists(path.join(generatedDir, 'seo-report.json'), null)
  if (!seoReport) {
    throw new Error('Missing public/generated/seo-report.json. Run the pipeline first.')
  }

  const baseUrl = resolveSiteBaseUrl(seoReport.baseUrl)
  const queuedUrls = Array.isArray(seoReport.queuedUrls) ? seoReport.queuedUrls : []
  const pages = await buildPageDiagnostics(
    queuedUrls,
    seoReport.sitemapUrl,
    seoReport.robotsUrl,
    baseUrl,
  )

  const summary = {
    queuedUrls: queuedUrls.length,
    existingFiles: pages.filter((page) => page.fileExists).length,
    canonicalMatches: pages.filter((page) => page.canonicalMatches).length,
    schemaBacked: pages.filter((page) => page.schemaCount > 0).length,
    indexable: pages.filter((page) => !page.noindex).length,
  }

  return {
    generatedAt: process.env.PIPELINE_FIXED_NOW || new Date().toISOString(),
    baseUrl,
    sitemapUrl: seoReport.sitemapUrl,
    robotsUrl: seoReport.robotsUrl,
    llmsUrl: seoReport.llmsUrl,
    queuedUrls,
    rootAssets: {
      sitemapPresent: existsSync(path.join(projectRoot, 'public', 'sitemap.xml')),
      robotsPresent: existsSync(path.join(projectRoot, 'public', 'robots.txt')),
      llmsPresent: existsSync(path.join(projectRoot, 'public', 'llms.txt')),
    },
    pages,
    summary,
    overallStatus:
      summary.queuedUrls > 0 &&
      summary.queuedUrls === summary.existingFiles &&
      summary.queuedUrls === summary.canonicalMatches &&
      summary.queuedUrls === summary.schemaBacked &&
      summary.queuedUrls === summary.indexable
        ? 'pass'
        : 'fail',
  }
}

async function main() {
  const runDirectory = await createReleaseRunDirectory('seo-diagnostics')
  const report = await runSeoDiagnostics()
  const markdown = renderMarkdown(report)
  const artifacts = {
    runDirectory,
    jsonReport: path.join(runDirectory, 'seo-diagnostics.json'),
    markdownReport: path.join(runDirectory, 'seo-diagnostics.md'),
    latestJson: path.join(projectRoot, 'public', 'generated', 'seo-diagnostics.json'),
    latestMarkdown: path.join(projectRoot, 'storage', 'seo-diagnostics.md'),
  }

  await writeJson(artifacts.jsonReport, report)
  await writeText(artifacts.markdownReport, markdown)
  await writeJson(artifacts.latestJson, report)
  await writeText(artifacts.latestMarkdown, markdown)

  console.log(JSON.stringify({ ...report, artifacts }, null, 2))

  if (report.overallStatus === 'fail') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
