import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(scriptDir, '..')

export function loadJson(relativePath) {
  const absolute = path.join(projectRoot, relativePath)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

export function loadExperiment(relativePath = 'config/experiment.json') {
  return loadJson(relativePath)
}

export function getThesisContract(experiment = loadExperiment()) {
  const contract = experiment.thesisContract ?? {}
  return {
    thesisKey: experiment.thesisKey,
    thesisLabel: experiment.thesisLabel,
    thesisName: experiment.thesisName,
    siteDefinition: experiment.siteDefinition,
    targetAudience: experiment.targetAudience,
    primaryOutcome: experiment.primaryOutcome,
    jobToBeDone: experiment.jobToBeDone,
    primaryInputs: safeArray(experiment.primaryInputs),
    primaryOutputs: safeArray(experiment.primaryOutputs),
    primarySearchIntent: experiment.primarySearchIntent,
    offer: experiment.offer,
    leadMagnet: experiment.leadMagnet,
    ctaLabel: experiment.ctaLabel,
    secondaryCtaLabel: experiment.secondaryCtaLabel,
    conversionAsset: experiment.conversionAsset,
    excludedAudience: safeArray(experiment.excludedAudience),
    forbiddenPositioning: safeArray(experiment.forbiddenPositioning),
    requiredAudienceTerms: safeArray(contract.requiredAudienceTerms),
    requiredInputTerms: safeArray(contract.requiredInputTerms),
    requiredOutcomeTerms: safeArray(contract.requiredOutcomeTerms),
    requiredContextTerms: safeArray(contract.requiredContextTerms),
    forbiddenPrimaryContexts: safeArray(contract.forbiddenPrimaryContexts),
    genericKeywordGuard: contract.genericKeywordGuard ?? {
      standaloneBlocked: ['video', 'prompt', 'short-form'],
      requireWithAny: [
        'product demo',
        'saas',
        'product launch',
        'feature update',
        'feature announcement',
        'walkthrough',
        'screenshot',
        'product',
        'launch',
      ],
    },
    gateRules: experiment.gateRules?.thesisAlignment ?? {
      passScore: 85,
      maxDuplicateRatio: 0.25,
      blockSitemapOnHardFail: true,
      blockReleaseOnSiteFail: true,
    },
    discoveryKeywords: safeArray(experiment.discoveryKeywords),
  }
}

export function safeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value == null || value === '') return []
  return [value]
}

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[^a-z0-9\s\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function includesAnyTerm(text, terms) {
  const haystack = normalizeText(text)
  return safeArray(terms).filter((term) => haystack.includes(normalizeText(term)))
}

export function matchesAnyTerm(text, terms) {
  return includesAnyTerm(text, terms).length > 0
}

/**
 * Standalone generic keywords (video, prompt, short-form) must co-occur with product-demo context.
 */
export function keywordAlignsWithThesis(keyword, contract = getThesisContract()) {
  const key = normalizeText(keyword)
  if (!key) return false

  const guard = contract.genericKeywordGuard
  const blocked = safeArray(guard.standaloneBlocked).map(normalizeText)
  const tokens = key.split(/\s+/).filter(Boolean)
  const isStandaloneBlocked =
    (tokens.length === 1 && blocked.includes(tokens[0])) || blocked.some((term) => key === term)
  if (isStandaloneBlocked) return false

  // Blocked tokens must co-occur with product-demo context terms.
  if (blocked.some((term) => tokens.includes(term) || key === term)) {
    return matchesAnyTerm(key, guard.requireWithAny)
  }

  const discovery = safeArray(contract.discoveryKeywords).map(normalizeText)
  // Require full discovery phrase containment (not reverse substring on short keywords).
  if (discovery.some((item) => key === item || key.includes(item))) return true

  const contextHits = includesAnyTerm(key, contract.requiredContextTerms)
  const outcomeHits = includesAnyTerm(key, contract.requiredOutcomeTerms)
  const inputHits = includesAnyTerm(key, contract.requiredInputTerms)
  if (outcomeHits.length || (contextHits.length >= 2 && inputHits.length)) return true

  if (matchesAnyTerm(key, contract.forbiddenPrimaryContexts)) return false
  return matchesAnyTerm(key, [
    ...contract.requiredOutcomeTerms,
    ...contract.requiredContextTerms,
    'saas',
    'product demo',
    'product launch',
    'feature launch',
    'feature announcement',
    'walkthrough',
    'screenshot',
  ])
}

export function detectForbiddenPositioning(text, contract = getThesisContract()) {
  const original = String(text || '')
  // Strip explicit exclusions so "not music video" does not fail the gate.
  const cleaned = original
    .replace(
      /\b(not|never|avoid|outside|except|excluding|without|and nothing)\b[^.!?\n]{0,140}\b(music videos?|ai films?|cinematic stor(?:y|ies)|faceless channels?|anime videos?|general social media content)\b/gi,
      ' ',
    )
    .replace(/\bnothing outside the product job[^.!?\n]{0,160}/gi, ' ')
    .replace(/not music video,\s*ai film,\s*or faceless channels?/gi, ' ')
  const haystack = normalizeText(cleaned)
  const hits = []
  for (const phrase of safeArray(contract.forbiddenPositioning)) {
    if (haystack.includes(normalizeText(phrase))) hits.push(phrase)
  }
  for (const phrase of safeArray(contract.forbiddenPrimaryContexts)) {
    if (haystack.includes(normalizeText(phrase))) hits.push(phrase)
  }
  // Generic portal patterns (positive positioning only)
  const patterns = [
    [/best ai video (tools|generators) (of|in) 20\d\d/i, 'generic AI video directory tone'],
    [/(?:^|[.!?]\s*)create an ai video\b/i, 'generic Create an AI video CTA'],
    [/all-?purpose ai video/i, 'all-purpose AI video positioning'],
    [/general ai video portal/i, 'general AI video portal'],
  ]
  for (const [pattern, label] of patterns) {
    if (pattern.test(cleaned)) hits.push(label)
  }
  return [...new Set(hits)]
}

export function extractAudienceInputOutcome(text, contract = getThesisContract()) {
  return {
    matchedAudience: includesAnyTerm(text, [
      ...contract.requiredAudienceTerms,
      'saas founder',
      'saas founders',
      'indie hacker',
      'indie hackers',
      'product marketer',
      'product marketers',
      'product team',
      'founder',
      'marketer',
    ]),
    matchedInputs: includesAnyTerm(text, [
      ...contract.requiredInputTerms,
      'screenshot',
      'screenshots',
      'screen recording',
      'recordings',
      'release notes',
      'feature update',
      'feature updates',
      'script',
    ]),
    matchedOutcomes: includesAnyTerm(text, [
      ...contract.requiredOutcomeTerms,
      'product demo',
      'demo video',
      'feature launch',
      'walkthrough',
      '15-60',
      '15–60',
      'seconds',
    ]),
    matchedContext: includesAnyTerm(text, contract.requiredContextTerms),
  }
}

export function buildClusterDefaultsFromContract(experiment = loadExperiment()) {
  const contract = getThesisContract(experiment)
  return {
    thesisKey: contract.thesisKey,
    label: contract.thesisLabel,
    thesisName: contract.thesisName,
    audience: contract.targetAudience,
    offer: contract.offer,
    leadMagnet: contract.leadMagnet,
    ctaLabel: contract.ctaLabel,
    secondaryCtaLabel: contract.secondaryCtaLabel,
    conversionAsset: contract.conversionAsset,
    siteDefinition: contract.siteDefinition,
    primaryOutcome: contract.primaryOutcome,
    jobToBeDone: contract.jobToBeDone,
    primaryInputs: contract.primaryInputs,
    primaryOutputs: contract.primaryOutputs,
    primaryKeyword: 'ai product demo video',
  }
}
