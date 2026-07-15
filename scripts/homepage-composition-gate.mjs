import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

export const defaultHomepageBudget = {
  maxMajorSections: 6,
  maxH2Count: 6,
  maxVisibleWordCount: 1400,
  maxPrimaryCtaOccurrences: 2,
  maxSecondaryCtaOccurrences: 1,
  maxToolDetailCards: 2,
  maxFaqItems: 4,
  maxInteractiveModules: 1,
  maxComparisonRows: 2,
  maxRepeatedVerdictOccurrences: 1,
  maxRepeatedParagraphRatio: 0.1,
  primaryCtaText: 'Get the Product Demo Workflow Pack',
  secondaryCtaText: 'See the 5-Step Workflow',
  requiredChildPageLinks: [
    '/compare/',
    '/workflow/',
    '/pricing/',
    '/free-vs-paid/',
    '/templates/',
    '/case-study/',
  ],
}

const removedModulePatterns = [
  { code: 'decision_helper_present', label: 'multi-question Decision Helper', pattern: /decision helper|selector-quiz|data-decision-helper/i },
  { code: 'full_comparison_table_present', label: 'full comparison table', pattern: /<table\b[\s\S]{0,1600}(?:quick verdict|hidden cost|when to switch|not for)[\s\S]{0,1200}<\/table>|class="[^"]*comparison-table/i },
  { code: 'prompt_generator_present', label: 'Quick Prompt Generator', pattern: /quick prompt generator|data-prompt-generator/i },
  { code: 'real_use_notes_present', label: 'long Real Use Notes', pattern: /real use notes|what these tools feel like on a real first run/i },
  { code: 'full_workflow_present', label: 'full five-step workflow', pattern: /(?:owner[\s\S]{0,80}failure point|failure point[\s\S]{0,80}owner)/i },
  { code: 'repair_guide_present', label: 'Repair Guide', pattern: /repair guide|what usually goes wrong/i },
  { code: 'public_routes_present', label: 'Public Routes block', pattern: /public routes|what to open next/i },
  { code: 'self_explaining_homepage', label: 'Why this homepage exists', pattern: /why this homepage exists/i },
]

const childPageDestinations = {
  comparison: '/compare/',
  workflow: '/workflow/',
  promptGenerator: '/templates/',
  repairGuide: '/workflow/',
  pricing: '/pricing/',
  freeVsPaid: '/free-vs-paid/',
  fullExample: '/case-study/',
  commercialService: '/hire/',
  cost: '/cost/',
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function stripTags(value) {
  return decodeHtmlEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
}

function stripInvisibleHtml(html) {
  return String(html ?? '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+(?:aria-hidden="true"|class="[^"]*(?:sr-only|visually-hidden|accessibility-only)[^"]*")[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
    .replace(/<[^>]+(?:aria-hidden='true'|class='[^']*(?:sr-only|visually-hidden|accessibility-only)[^']*')[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
}

function visibleTextFromHtml(html) {
  const withoutInvisible = stripInvisibleHtml(html)
    .replace(/<p\b[^>]*>\s*This page contains affiliate links\.[\s\S]*?<\/p>/gi, ' ')
    .replace(/<[^>]+data-legal-disclosure[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
  return normalizeWhitespace(stripTags(withoutInvisible))
}

function countWords(value) {
  const words = normalizeWhitespace(value).match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)
  return words?.length ?? 0
}

function extractTagTexts(html, tagName) {
  const matches = []
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  for (const match of String(html ?? '').matchAll(regex)) {
    const text = normalizeWhitespace(stripTags(match[1]))
    if (text) matches.push(text)
  }
  return matches
}

function extractSingleTagText(html, tagName) {
  return extractTagTexts(html, tagName)[0] ?? ''
}

function extractMetaContent(html, nameOrProperty) {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`<meta\\b(?=[^>]+(?:name|property)=["']${escaped}["'])[^>]+content=["']([^"']*)["'][^>]*>`, 'i')
  return decodeHtmlEntities(String(html ?? '').match(regex)?.[1] ?? '')
}

function extractHrefList(html) {
  const links = []
  for (const match of String(html ?? '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    links.push(match[1])
  }
  return [...new Set(links)]
}

function normalizeRoute(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw, 'https://automiora.com')
    return parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
  } catch {
    const pathOnly = raw.split(/[?#]/)[0]
    if (!pathOnly.startsWith('/')) return ''
    return pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`
  }
}

function countTextOccurrences(haystack, needle) {
  const normalizedNeedle = normalizeWhitespace(needle)
  if (!normalizedNeedle) return 0
  const escaped = normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...normalizeWhitespace(haystack).matchAll(new RegExp(escaped, 'gi'))].length
}

function countMajorSections(html) {
  const explicitIds = [...String(html ?? '').matchAll(/\bdata-home-section=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter(Boolean)
  if (explicitIds.length > 0) return new Set(explicitIds).size

  const mainMatch = String(html ?? '').match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  const mainSectionCount = [...(mainMatch?.[1] ?? '').matchAll(/<section\b/gi)].length
  const hasHero = /<header\b[\s\S]*?<h1\b/i.test(html) || /class=["'][^"']*hero/i.test(html)
  return mainSectionCount + (hasHero ? 1 : 0)
}

function extractMajorSectionHeadings(html) {
  const sections = []
  const explicitRegex = /<([a-z][\w:-]*)\b[^>]*data-home-section=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi
  for (const match of String(html ?? '').matchAll(explicitRegex)) {
    sections.push({
      id: match[2],
      heading: extractSingleTagText(match[3], 'h1') || extractSingleTagText(match[3], 'h2'),
    })
  }
  if (sections.length > 0) return sections

  const header = String(html ?? '').match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? ''
  if (header) sections.push({ id: 'hero', heading: extractSingleTagText(header, 'h1') })
  const mainMatch = String(html ?? '').match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  for (const [index, match] of [...(mainMatch?.[1] ?? '').matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].entries()) {
    sections.push({
      id: `section-${index + 1}`,
      heading: extractSingleTagText(match[1], 'h2'),
    })
  }
  return sections
}

function extractParagraphTexts(html) {
  const visibleHtml = stripInvisibleHtml(html)
  return extractTagTexts(visibleHtml, 'p').filter((text) => countWords(text) >= 7)
}

function computeDuplicateParagraphRatio(paragraphs) {
  if (paragraphs.length === 0) return { ratio: 0, duplicates: [] }
  const counts = new Map()
  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([text, count]) => ({ text, count }))
  const duplicateCount = duplicates.reduce((sum, item) => sum + item.count - 1, 0)
  return {
    ratio: Number((duplicateCount / paragraphs.length).toFixed(3)),
    duplicates,
  }
}

function extractVerdicts(html) {
  const verdicts = []
  const attrRegex = /<([a-z][\w:-]*)\b[^>]*data-tool-verdict[^>]*>([\s\S]*?)<\/\1>/gi
  for (const match of String(html ?? '').matchAll(attrRegex)) {
    const text = normalizeWhitespace(stripTags(match[2]))
    if (text) verdicts.push(text)
  }

  const labeledRegex = /<p\b[^>]*>\s*<span\b[^>]*class=["'][^"']*meta-label[^"']*["'][^>]*>\s*Verdict\s*<\/span>([\s\S]*?)<\/p>/gi
  for (const match of String(html ?? '').matchAll(labeledRegex)) {
    const text = normalizeWhitespace(stripTags(match[1]))
    if (text) verdicts.push(text)
  }

  return verdicts
}

function findRepeatedVerdicts(verdicts) {
  const counts = new Map()
  for (const verdict of verdicts) {
    const normalized = verdict.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    counts.set(normalized, { text: verdict, count: (counts.get(normalized)?.count ?? 0) + 1 })
  }
  return [...counts.values()].filter((item) => item.count > defaultHomepageBudget.maxRepeatedVerdictOccurrences)
}

function extractOgImages(html) {
  return [
    extractMetaContent(html, 'og:image'),
    extractMetaContent(html, 'twitter:image'),
  ].filter(Boolean)
}

function isPublicCrawlableImage(url) {
  if (!url) return true
  if (/\/generated-sites\//i.test(url)) return false
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      return parsed.pathname.startsWith('/media/')
    } catch {
      return false
    }
  }
  return url.startsWith('/media/') || url.startsWith('media/')
}

function hasGenericAiVideoPositioning({ title, description, h1, heroText }) {
  const positioningText = `${title} ${description} ${h1} ${heroText}`.toLowerCase()
  const hasProductDemo = /product demo|saas demo|demo video/.test(positioningText)
  const hasSaasAudience = /saas founder|saas team|indie hacker|product marketer/.test(positioningText)
  if (!hasProductDemo || !hasSaasAudience) return true
  if (/^(?:ai\s+)?video workflow\b/i.test(h1) && !/product demo|saas/i.test(h1)) return true
  return /\bai video workflow\b/i.test(`${title} ${h1}`) && !/product demo|saas/i.test(`${title} ${h1}`)
}

function buildViolation(code, message, detail = {}) {
  return { code, message, ...detail }
}

function evaluateRemovedModules(html) {
  const removedModules = []
  const violations = []
  const lowerHtml = String(html ?? '').toLowerCase()

  for (const item of removedModulePatterns) {
    if (!item.pattern.test(html)) continue

    if (item.code === 'full_workflow_present') {
      const detailedStepCount = (lowerHtml.match(/\bfailure point\b/g) ?? []).length
      if (detailedStepCount < 4) continue
    }

    removedModules.push(item.label)
    violations.push(buildViolation(item.code, `${item.label} must move off the homepage.`))
  }

  return { removedModules: [...new Set(removedModules)], violations }
}

function evaluateChildPageLinks(childPageLinks, requiredLinks) {
  return safeArray(requiredLinks).filter((routePath) => !childPageLinks.includes(routePath))
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function mergeBudget(budget) {
  return {
    ...defaultHomepageBudget,
    ...(budget ?? {}),
    requiredChildPageLinks:
      safeArray(budget?.requiredChildPageLinks).length > 0
        ? budget.requiredChildPageLinks
        : defaultHomepageBudget.requiredChildPageLinks,
  }
}

export async function loadHomepageBudget(budgetPath = path.join(projectRoot, 'config', 'homepage-content-budget.json')) {
  if (!existsSync(budgetPath)) return defaultHomepageBudget
  const parsed = JSON.parse(await readFile(budgetPath, 'utf8'))
  return mergeBudget(parsed)
}

export function evaluateHomepageCompositionHtml(html, options = {}) {
  const budget = mergeBudget(options.budget)
  const auditableHtml = stripInvisibleHtml(html)
  const visibleText = visibleTextFromHtml(html)
  const title = extractTagTexts(html, 'title')[0] ?? ''
  const description = extractMetaContent(html, 'description')
  const h1 = extractSingleTagText(html, 'h1')
  const headerHtml = String(html ?? '').match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? ''
  const heroText = normalizeWhitespace(stripTags(stripInvisibleHtml(headerHtml)))
  const h2Texts = extractTagTexts(stripInvisibleHtml(html), 'h2')
  const hrefs = extractHrefList(html)
  const childPageLinks = [...new Set(hrefs.map(normalizeRoute).filter(Boolean))]
  const paragraphStats = computeDuplicateParagraphRatio(extractParagraphTexts(html))
  const verdicts = extractVerdicts(html)
  const repeatedVerdicts = findRepeatedVerdicts(verdicts).filter(
    (item) => item.count > budget.maxRepeatedVerdictOccurrences,
  )
  const removedModuleResult = evaluateRemovedModules(auditableHtml)
  const majorSectionCount = countMajorSections(html)
  const h2Count = h2Texts.length
  const visibleWordCount = countWords(visibleText)
  const primaryCtaOccurrences = countTextOccurrences(visibleText, budget.primaryCtaText)
  const secondaryCtaOccurrences = countTextOccurrences(visibleText, budget.secondaryCtaText)
  const toolDetailCount = (
    String(auditableHtml ?? '').match(/\bdata-tool-detail-card\b|class=["'][^"']*\btool-card\b/gi) ?? []
  ).length
  const faqCount = (
    String(auditableHtml ?? '').match(/\bdata-faq-item\b|<details\b/gi) ?? []
  ).length
  const interactiveModuleCount = (
    String(auditableHtml ?? '').match(/\bdata-prompt-generator\b|\bdata-decision-helper\b|\bselector-quiz\b|quick prompt generator/gi) ?? []
  ).length
  const comparisonRowCount = (
    String(auditableHtml ?? '').match(/\bdata-comparison-row\b|class=["'][^"']*\bcomparison-row\b/gi) ?? []
  ).length
  const ogImages = extractOgImages(html)
  const badOgImages = ogImages.filter((url) => !isPublicCrawlableImage(url))
  const missingChildPageLinks = evaluateChildPageLinks(childPageLinks, budget.requiredChildPageLinks)
  const violations = [...removedModuleResult.violations]
  const warnings = []

  if (majorSectionCount > budget.maxMajorSections) {
    violations.push(buildViolation('major_sections_over_budget', `Homepage has ${majorSectionCount} major sections; max is ${budget.maxMajorSections}.`, {
      sections: extractMajorSectionHeadings(html),
    }))
  }

  if (h2Count > budget.maxH2Count) {
    violations.push(buildViolation('h2_over_budget', `Homepage has ${h2Count} H2s; max is ${budget.maxH2Count}.`, { h2Texts }))
  }

  if (visibleWordCount > budget.maxVisibleWordCount) {
    violations.push(buildViolation('visible_words_over_budget', `Homepage has ${visibleWordCount} visible words; max is ${budget.maxVisibleWordCount}.`))
  }

  if (primaryCtaOccurrences > budget.maxPrimaryCtaOccurrences) {
    violations.push(buildViolation('primary_cta_over_budget', `"${budget.primaryCtaText}" appears ${primaryCtaOccurrences} times; max is ${budget.maxPrimaryCtaOccurrences}.`))
  }

  if (secondaryCtaOccurrences > budget.maxSecondaryCtaOccurrences) {
    violations.push(buildViolation('secondary_cta_over_budget', `"${budget.secondaryCtaText}" appears ${secondaryCtaOccurrences} times; max is ${budget.maxSecondaryCtaOccurrences}.`))
  }

  if (toolDetailCount > budget.maxToolDetailCards) {
    violations.push(buildViolation('tool_detail_cards_over_budget', `Homepage has ${toolDetailCount} tool detail cards; max is ${budget.maxToolDetailCards}.`))
  }

  if (faqCount > budget.maxFaqItems) {
    violations.push(buildViolation('faq_items_over_budget', `Homepage has ${faqCount} FAQ items; max is ${budget.maxFaqItems}.`))
  }

  if (interactiveModuleCount > budget.maxInteractiveModules) {
    violations.push(buildViolation('interactive_modules_over_budget', `Homepage has ${interactiveModuleCount} interactive modules; max is ${budget.maxInteractiveModules}.`))
  }

  if (comparisonRowCount > budget.maxComparisonRows) {
    violations.push(buildViolation('comparison_rows_over_budget', `Homepage has ${comparisonRowCount} comparison rows; max is ${budget.maxComparisonRows}.`))
  }

  if (paragraphStats.ratio > budget.maxRepeatedParagraphRatio) {
    violations.push(buildViolation('repeated_paragraph_ratio_over_budget', `Repeated paragraph ratio is ${paragraphStats.ratio}; max is ${budget.maxRepeatedParagraphRatio}.`, {
      duplicateParagraphs: paragraphStats.duplicates,
    }))
  }

  if (repeatedVerdicts.length > 0) {
    violations.push(buildViolation('repeated_verdicts', 'Tool verdicts repeat across sections.', { repeatedVerdicts }))
  }

  if (hasGenericAiVideoPositioning({ title, description, h1, heroText })) {
    violations.push(buildViolation('generic_ai_video_positioning', 'Homepage title, meta, H1, and hero must position the page around SaaS product demo videos, not generic AI video workflow.'))
  }

  const hasLabelledWorkedExample = /internal worked example|editorial scenario|real case|verified customer result/i.test(visibleText)
  if (!hasLabelledWorkedExample) {
    violations.push(buildViolation('missing_labelled_worked_example', 'Homepage needs a clearly labelled internal worked example, editorial scenario, real case, or verified customer result.'))
  }

  if (/\b(?:customer result|proven result|how teams actually use this)\b/i.test(visibleText) && !/verified customer result|real case/i.test(visibleText)) {
    violations.push(buildViolation('unlabelled_fictional_proof', 'Customer/proven/team proof language must be explicitly verified or replaced with an internal worked example/editorial scenario label.'))
  }

  if (missingChildPageLinks.length > 0) {
    violations.push(buildViolation('missing_child_page_links', 'Homepage must route deep content to child pages.', {
      missingChildPageLinks,
    }))
  }

  if (badOgImages.length > 0) {
    violations.push(buildViolation('og_image_not_public', 'Homepage OG/Twitter image must use a public /media/ path, not a blocked generated-sites path.', {
      badOgImages,
    }))
  }

  const integrationChecks = {
    ga4: /gtag\(|G-[A-Z0-9]+|data-ga4-event/i.test(html),
    leadCaptureCta: /data-ga4-event=["'](?:asset_cta_click|lead_capture|asset_form_submit)|href=["']\/(?:prompt-pack|workflow-checklist|comparison-worksheet)\//i.test(html),
    affiliateDisclosurePreserved:
      !/<a\b[^>]*data-ga4-event=["']affiliate_click["'][^>]*>/i.test(auditableHtml) ||
      /This page contains affiliate links/i.test(auditableHtml),
  }

  for (const [key, pass] of Object.entries(integrationChecks)) {
    if (!pass) {
      warnings.push({ code: `integration_${key}_missing`, message: `Could not verify ${key} in homepage HTML.` })
    }
  }

  return {
    path: options.path ?? '/',
    status: violations.length === 0 ? 'pass' : 'fail',
    majorSectionCount,
    h2Count,
    visibleWordCount,
    primaryCtaOccurrences,
    secondaryCtaOccurrences,
    toolDetailCount,
    faqCount,
    interactiveModuleCount,
    comparisonRowCount,
    duplicateParagraphRatio: paragraphStats.ratio,
    repeatedVerdicts,
    removedModules: removedModuleResult.removedModules,
    movedToChildPages: childPageDestinations,
    childPageLinks,
    violations,
    warnings,
    integrationChecks,
    ogImages,
    visibleText,
  }
}

export async function writeHomepageCompositionReport(report, outputPath = path.join(projectRoot, 'public', 'generated', 'homepage-composition-report.json')) {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return outputPath
}

export async function runHomepageCompositionGate(options = {}) {
  const htmlPath = options.htmlPath ?? path.join(projectRoot, 'public', 'index.html')
  const budget = options.budget ?? await loadHomepageBudget(options.budgetPath)
  const html = options.html ?? await readFile(htmlPath, 'utf8')
  const report = evaluateHomepageCompositionHtml(html, {
    budget,
    path: options.path ?? '/',
  })
  const outputPath = await writeHomepageCompositionReport(report, options.outputPath)
  return { ...report, outputPath }
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    index += 1
  }
  return parsed
}

async function main() {
  const args = parseArgs()
  const report = await runHomepageCompositionGate({
    htmlPath: args.html ? path.resolve(projectRoot, String(args.html)) : undefined,
    budgetPath: args.budget ? path.resolve(projectRoot, String(args.budget)) : undefined,
    outputPath: args.output ? path.resolve(projectRoot, String(args.output)) : undefined,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'pass') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
