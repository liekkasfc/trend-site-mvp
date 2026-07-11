import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMMERCIAL_PAGE_SPECS,
  dedupe,
  meaningfulText,
  readJsonIfExists,
  writeJson,
  writeText,
} from './affiliate-lib.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const projectRoot = path.resolve(__dirname, '..')

const generatedDir = path.join(projectRoot, 'public', 'generated')
const storageDir = path.join(projectRoot, 'storage')
const pipelineReportPath = path.join(generatedDir, 'pipeline-report.json')
const outputJsonPath = path.join(generatedDir, 'pinterest-pack.json')
const outputMarkdownPath = path.join(storageDir, 'pinterest-pack.md')

const fallbackAudience = 'AI video operators comparing DIY, templates, and outsourced execution'
const defaultSiteBaseUrl = process.env.SITE_BASE_URL || 'https://automiora.com'

function normalizeRoutePath(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === '/') return '/'
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`
}

function publicHtmlPath(routePath) {
  const normalized = normalizeRoutePath(routePath)
  if (normalized === '/') return path.join(projectRoot, 'public', 'index.html')
  return path.join(projectRoot, 'public', normalized.replace(/^\/+|\/+$/g, ''), 'index.html')
}

function isReleaseEligibleGate(gate) {
  const status = String(gate?.status ?? '').toLowerCase()
  return status === 'pass' || (status === 'needs_review' && gate?.wikiFirstPass === true)
}

function pageHtmlIsEligible(routePath) {
  const htmlPath = publicHtmlPath(routePath)
  if (!existsSync(htmlPath)) return false
  const html = readFileSync(htmlPath, 'utf8')
  if (/<meta\s+name="robots"[^>]+noindex/i.test(html)) return false
  return html.includes('rel="canonical"')
}

function normalizePageForPin(page, siteSlug = 'ai-video-workflow-short-form-demo') {
  const spec = COMMERCIAL_PAGE_SPECS.find((item) => item.pageType === page.type || item.slug === page.slug)
  const routePath = normalizeRoutePath(meaningfulText(page.publicPath) || meaningfulText(page.path) || spec?.publicPath || '')
  return {
    siteSlug,
    pageType: page.type ?? spec?.pageType ?? '',
    slug: page.slug ?? spec?.slug ?? '',
    title: meaningfulText(page.title) || spec?.title || '',
    description: meaningfulText(page.metaDescription) || spec?.metaDescription || '',
    path: routePath,
    indexingDirective: page.indexingDirective ?? '',
  }
}

function getCommercialPages(report) {
  const pageTypes = new Set(COMMERCIAL_PAGE_SPECS.map((item) => item.pageType))
  return Array.isArray(report?.sites)
    ? report.sites.flatMap((site) => {
        const gateEligible = isReleaseEligibleGate(site?.gates?.publish)
        return (Array.isArray(site.pages) ? site.pages : [])
          .filter((page) =>
            gateEligible &&
            pageTypes.has(page.type) &&
            page.indexingDirective === 'index' &&
            pageHtmlIsEligible(page.publicPath || page.path),
          )
          .map((page) => normalizePageForPin(page, site.siteSlug))
      })
    : []
}

function buildPinVariants(page, siteBaseUrl = defaultSiteBaseUrl) {
  const titleSurface = page.title.replace(/\?$/, '')
  const baseUrlPath = page.path || '/'
  const destinationUrl = new URL(baseUrlPath, `${siteBaseUrl.replace(/\/+$/, '')}/`).toString()
  const variants = [
    {
      angle: 'cost',
      label: 'Cost',
      title: `Cost Map: ${titleSurface}`,
      imageHeadline: 'What AI Video Really Costs',
      imageSubheadline: 'Tools, retries, editing, and quotes',
      description:
        'A cost-first pin that separates visible tool costs, retry risk, editing labor, and provider quotes before a buyer spends.',
      imagePrompt:
        'Vertical 2:3 editorial checklist graphic with four labeled cost blocks, crisp typography, neutral product-workflow styling, no income promises.',
    },
    {
      angle: 'red-flags',
      label: 'Red flags',
      title: `Red Flags: ${titleSurface}`,
      imageHeadline: 'Stop Before You Order',
      imageSubheadline: 'Scope, rights, revisions, delivery',
      description:
        'A caution-focused pin for buyers checking scope, rights, revision limits, and delivery format before hiring or outsourcing.',
      imagePrompt:
        'Vertical 2:3 red-flag checklist graphic for a video production buyer, clear warning labels, professional SaaS editorial style, no vendor logos.',
    },
    {
      angle: 'diy-vs-hire',
      label: 'DIY vs Hire',
      title: `DIY vs Hire: ${titleSurface}`,
      imageHeadline: 'DIY, Template, or Hire?',
      imageSubheadline: 'Choose the next safe step',
      description:
        `A decision-path pin that helps AI video buyers choose DIY, templates, or hiring. ${page.description}`,
      imagePrompt:
        'Vertical 2:3 three-lane decision diagram with DIY, template, and hire columns, clean comparison layout, no affiliate URL or marketplace screenshot.',
    },
  ]

  return variants.map((variant) => ({
    id: `${page.slug}-${variant.angle}`,
    siteSlug: page.siteSlug,
    pageSlug: page.slug,
    pageType: page.pageType,
    variant: variant.label,
    status: 'review_required',
    destinationUrl,
    destinationPath: baseUrlPath,
    utmSource: 'pinterest',
    utmMedium: 'organic',
    utmCampaign: `affiliate-commercial-${page.pageType}`,
    utmContent: variant.angle,
    boardSuggestion: 'AI Video Workflow',
    title: variant.title,
    description: variant.description,
    altText: `${variant.imageHeadline} checklist for ${page.title}`,
    imageHeadline: variant.imageHeadline,
    imageSubheadline: variant.imageSubheadline,
    imagePrompt: variant.imagePrompt,
    affiliateDisclosure:
      'This destination page may contain affiliate links. Automiora may earn a commission at no additional cost to the buyer.',
    audience: fallbackAudience,
    aspectRatio: '2:3',
  }))
}

export function buildPinterestPack(pages, generatedAt = new Date().toISOString(), options = {}) {
  const pins = pages.flatMap((page) => buildPinVariants(page, options.siteBaseUrl ?? defaultSiteBaseUrl))
  return {
    generatedAt,
    status: pins.length > 0 ? 'review_required' : 'no_eligible_pages',
    summary: {
      pageCount: pages.length,
      pinCount: pins.length,
      destinationPaths: dedupe(pins.map((pin) => pin.destinationPath)),
    },
    pages,
    pins,
  }
}

export function renderPinterestMarkdown(pack) {
  const lines = [
    '# Pinterest Pack',
    '',
    `- Generated at: ${pack.generatedAt}`,
    `- Status: ${pack.status}`,
    `- Pins: ${pack.summary.pinCount}`,
    '',
  ]

  for (const pin of pack.pins) {
    lines.push(`## ${pin.title}`)
    lines.push(`- ID: ${pin.id}`)
    lines.push(`- Destination: ${pin.destinationUrl}`)
    lines.push(`- Variant: ${pin.variant}`)
    lines.push(`- Headline: ${pin.imageHeadline}`)
    lines.push(`- Subheadline: ${pin.imageSubheadline}`)
    lines.push(`- Description: ${pin.description}`)
    lines.push(`- Image prompt: ${pin.imagePrompt}`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

export async function generatePinterestPack() {
  const report = await readJsonIfExists(pipelineReportPath, null)
  const pages = getCommercialPages(report)
  const pack = buildPinterestPack(pages)
  await writeJson(outputJsonPath, pack)
  await writeText(outputMarkdownPath, renderPinterestMarkdown(pack))
  return {
    ...pack,
    artifacts: {
      json: outputJsonPath,
      markdown: outputMarkdownPath,
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generatePinterestPack()
    .then((pack) => {
      console.log(
        JSON.stringify(
          {
            status: pack.status,
            pages: pack.summary.pageCount,
            pins: pack.summary.pinCount,
            artifacts: pack.artifacts,
          },
          null,
          2,
        ),
      )
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
