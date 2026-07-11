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

function normalizePageForPin(page, siteSlug = 'ai-video-workflow-short-form-demo') {
  const spec = COMMERCIAL_PAGE_SPECS.find((item) => item.pageType === page.type || item.slug === page.slug)
  return {
    siteSlug,
    pageType: page.type ?? spec?.pageType ?? '',
    slug: page.slug ?? spec?.slug ?? '',
    title: meaningfulText(page.title) || spec?.title || '',
    description: meaningfulText(page.metaDescription) || spec?.metaDescription || '',
    path: meaningfulText(page.publicPath) || meaningfulText(page.path) || spec?.publicPath || '',
  }
}

function getCommercialPages(report) {
  const pageTypes = new Set(COMMERCIAL_PAGE_SPECS.map((item) => item.pageType))
  const reportPages = Array.isArray(report?.sites)
    ? report.sites.flatMap((site) =>
        (Array.isArray(site.pages) ? site.pages : [])
          .filter((page) => pageTypes.has(page.type))
          .map((page) => normalizePageForPin(page, site.siteSlug)),
      )
    : []

  if (reportPages.length > 0) {
    return reportPages
  }

  return COMMERCIAL_PAGE_SPECS.map((spec) =>
    normalizePageForPin(
      {
        type: spec.pageType,
        slug: spec.slug,
        title: spec.title,
        metaDescription: spec.metaDescription,
        publicPath: spec.publicPath,
      },
      'ai-video-workflow-short-form-demo',
    ),
  )
}

function buildPinVariants(page) {
  const titleSurface = page.title.replace(/\?$/, '')
  const baseUrlPath = page.path || '/'
  const variants = [
    {
      angle: 'decision',
      title: `${titleSurface}: DIY or Hire?`,
      overlayText: ['DIY', 'Template', 'Hire'].join(' vs '),
      description:
        `Use this decision path before spending budget on AI video production. ${page.description}`,
      visualBrief:
        'Three-column decision board with checklist marks, simple cost/time labels, and a clear final branch.',
    },
    {
      angle: 'cost',
      title: `What AI Video Really Costs`,
      overlayText: 'Tool cost + retry cost + editing',
      description:
        'Pin a cost breakdown that separates tool subscriptions, retries, voice-over, editing, and outsourced help.',
      visualBrief:
        'Clean cost-stack layout with line items, neutral colors, and a small note to verify current vendor pricing.',
    },
    {
      angle: 'hiring',
      title: `AI Video Hiring Checklist`,
      overlayText: 'Scope, rights, revisions, delivery',
      description:
        'Use this checklist before sending a brief to an AI video editor, motion designer, or voice-over freelancer.',
      visualBrief:
        'Checklist layout with brief materials, rights, revision plan, red flags, and delivery format callouts.',
    },
  ]

  return variants.map((variant, index) => ({
    id: `${page.slug}-${variant.angle}`,
    siteSlug: page.siteSlug,
    pageSlug: page.slug,
    pageType: page.pageType,
    status: 'review_required',
    destinationPath: baseUrlPath,
    utm: {
      source: 'pinterest',
      medium: 'organic_social',
      campaign: `affiliate-commercial-${page.pageType}`,
      content: variant.angle,
    },
    board: 'AI Video Workflow',
    audience: fallbackAudience,
    title: variant.title,
    overlayText: variant.overlayText,
    description: variant.description,
    visualBrief: variant.visualBrief,
    aspectRatio: '2:3',
    priority: index === 0 ? 'high' : 'medium',
    reviewNotes: [
      'Confirm destination page passed Gate 2 before scheduling.',
      'Do not include income, speed, or guaranteed-result claims.',
      'Use only current screenshots or generated visuals that match the page content.',
    ],
  }))
}

export function buildPinterestPack(pages, generatedAt = new Date().toISOString()) {
  const pins = pages.flatMap(buildPinVariants)
  return {
    generatedAt,
    status: 'review_required',
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
    lines.push(`- Destination: ${pin.destinationPath}`)
    lines.push(`- Overlay: ${pin.overlayText}`)
    lines.push(`- Description: ${pin.description}`)
    lines.push(`- Visual brief: ${pin.visualBrief}`)
    lines.push(`- Priority: ${pin.priority}`)
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
