export const PUBLISH_GATE_STATUSES = Object.freeze(['pass', 'fail', 'warning', 'skipped'])

export function normalizePublishGateStatus(value) {
  const status = String(value ?? '').trim().toLowerCase()
  if (PUBLISH_GATE_STATUSES.includes(status)) return status
  if (status === 'needs_review') return 'warning'
  return 'skipped'
}

export function isProductionPublishAllowed(value) {
  return normalizePublishGateStatus(value) === 'pass'
}

export function summarizePipelinePublishGate(report, siteSlug) {
  const site = (report?.sites ?? []).find((item) => item.siteSlug === siteSlug) ?? report?.sites?.[0] ?? null
  const gate = site?.gates?.publish ?? site?.deployment?.publishGate ?? null
  const status = normalizePublishGateStatus(
    gate?.status ?? site?.deployment?.publishGateStatus ?? site?.publishGateStatus,
  )
  const thesisAlignment = gate?.thesisAlignment ?? site?.thesisAlignmentReport ?? null
  const blockedPages = [
    ...(thesisAlignment?.blockedPaths ?? []),
    ...(gate?.evidence?.thesisAlignmentBlockedPaths ?? []),
  ].filter(Boolean)
  const uniqueBlockedPages = [...new Set(blockedPages)]
  const reasons = [
    ...(gate?.evidence?.homepageCompositionViolations ?? []).map((code) => `homepage:${code}`),
    ...(uniqueBlockedPages.length ? [`blockedPages:${uniqueBlockedPages.join(',')}`] : []),
    ...((gate?.evidence?.unconsumedBacklogItems ?? []).map((id) => `reviewBacklog:${id}`)),
  ]

  return {
    status,
    siteSlug: site?.siteSlug ?? siteSlug,
    blockedPages: uniqueBlockedPages,
    reasons: reasons.length ? reasons : status === 'pass' ? [] : ['publish gate did not report a pass state'],
    source: 'public/generated/pipeline-report.json',
  }
}

export function summarizePipelinePublishGates(report) {
  const sites = Array.isArray(report?.sites) ? report.sites : []
  const entries = sites.map((site) => summarizePipelinePublishGate(report, site.siteSlug))
  const statuses = entries.map((entry) => entry.status)
  const status = statuses.includes('fail')
    ? 'fail'
    : statuses.includes('warning')
      ? 'warning'
      : statuses.includes('skipped') || entries.length === 0
        ? 'skipped'
        : 'pass'

  return {
    status,
    sites: entries,
    blockedPages: [...new Set(entries.flatMap((entry) => entry.blockedPages))],
    reasons: [...new Set(entries.flatMap((entry) => entry.reasons))],
    source: 'public/generated/pipeline-report.json',
  }
}
