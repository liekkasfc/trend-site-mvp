import path from 'node:path'

import {
  aggregateAffiliateRows,
  loadAffiliateConfig,
  readFiverrImportRows,
  readJsonIfExists,
  safeArray,
  writeJson,
  writeText,
} from './affiliate-lib.mjs'

export const projectRoot = process.cwd()
export const defaultImportDirectory = path.join(projectRoot, 'storage', 'imports', 'fiverr')
export const storageReportPath = path.join(projectRoot, 'storage', 'affiliate-performance.json')
export const storageMarkdownPath = path.join(projectRoot, 'storage', 'affiliate-performance.md')
export const publicSummaryPath = path.join(projectRoot, 'public', 'generated', 'affiliate-summary.json')

function parseArgs(argv) {
  const options = {
    importDirectory: defaultImportDirectory,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--import-dir' && argv[index + 1]) {
      options.importDirectory = path.resolve(argv[index + 1])
      index += 1
    }
  }
  return options
}

export function buildAffiliateMarkdown(report) {
  const lines = [
    '# Affiliate Performance',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Data through: ${report.dataThroughDate ?? 'n/a'}`,
    '',
    '## Summary',
    `- Clicks: ${report.summary.clicks}`,
    `- Registrations: ${report.summary.registrations}`,
    `- FTB: ${report.summary.ftb}`,
    `- Commission: $${report.summary.commission.toFixed(2)}`,
    `- Click-to-registration rate: ${(report.summary.clickToRegistrationRate * 100).toFixed(2)}%`,
    `- Click-to-FTB rate: ${(report.summary.clickToFtbRate * 100).toFixed(2)}%`,
    `- Registration-to-FTB rate: ${(report.summary.registrationToFtbRate * 100).toFixed(2)}%`,
    `- Commission per click: $${report.summary.commissionPerClick.toFixed(4)}`,
    `- Commission per FTB: $${report.summary.commissionPerFtb.toFixed(2)}`,
    '',
    '## Tracking Code Performance',
  ]

  if (report.byTrackingCode.length === 0) {
    lines.push('- No tracking-code rows yet.')
  }
  for (const row of report.byTrackingCode) {
    lines.push(
      `- ${row.trackingCode}: ${row.clicks} click(s), ${row.registrations} registration(s), ${row.ftb} FTB, $${row.commission.toFixed(2)} commission`,
    )
  }

  lines.push('', '## Country Performance')
  if (report.byCountry.length === 0) {
    lines.push('- No country rows yet.')
  }
  for (const row of report.byCountry) {
    lines.push(
      `- ${row.country}: ${row.clicks} click(s), ${row.registrations} registration(s), ${row.ftb} FTB, $${row.commission.toFixed(2)} commission`,
    )
  }

  lines.push('', '## Trends')
  lines.push(`- 7 days: ${report.trends.sevenDay.clicks} click(s), ${report.trends.sevenDay.ftb} FTB, $${report.trends.sevenDay.commission.toFixed(2)} commission`)
  lines.push(`- 30 days: ${report.trends.thirtyDay.clicks} click(s), ${report.trends.thirtyDay.ftb} FTB, $${report.trends.thirtyDay.commission.toFixed(2)} commission`)

  lines.push('', '## Data Quality')
  lines.push(
    report.unmatchedTrackingCodes.length > 0
      ? `- Unmatched tracking code(s): ${report.unmatchedTrackingCodes.join(', ')}`
      : '- Unmatched tracking code(s): none',
  )
  if (report.anomalies.length === 0) {
    lines.push('- Anomalies: none')
  } else {
    for (const anomaly of report.anomalies) {
      lines.push(`- Anomaly: ${anomaly}`)
    }
  }

  return `${lines.join('\n')}\n`
}

export function buildAffiliatePublicSummary(report) {
  return {
    generatedAt: report.generatedAt,
    status: report.status,
    dataThroughDate: report.dataThroughDate,
    affiliateClicks: report.summary.clicks,
    affiliateRegistrations: report.summary.registrations,
    affiliateFtbs: report.summary.ftb,
    affiliateCommission: report.summary.commission,
    affiliateClickRate: report.summary.clickToRegistrationRate,
    affiliateFtbRate: report.summary.clickToFtbRate,
    affiliateRevenuePerClick: report.summary.commissionPerClick,
    topTrackingCodes: safeArray(report.byTrackingCode).slice(0, 10),
    anomalies: report.anomalies,
    unmatchedTrackingCodes: report.unmatchedTrackingCodes,
  }
}

export async function buildAffiliateReport(options = {}) {
  const affiliateConfig = await loadAffiliateConfig(projectRoot)
  const trackingCodes = safeArray(affiliateConfig.offers).map((offer) => offer.trackingCode)
  const importDirectory = options.importDirectory ?? defaultImportDirectory
  const rows = options.rows ?? await readFiverrImportRows(importDirectory)
  const report = aggregateAffiliateRows(rows, trackingCodes)
  const markdown = buildAffiliateMarkdown(report)
  const publicSummary = buildAffiliatePublicSummary(report)

  await writeJson(storageReportPath, report)
  await writeText(storageMarkdownPath, markdown)
  await writeJson(publicSummaryPath, publicSummary)

  return {
    report,
    artifacts: {
      storageReportPath,
      storageMarkdownPath,
      publicSummaryPath,
      importDirectory,
    },
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const existing = await readJsonIfExists(storageReportPath, null)
  const result = existing && process.argv.includes('--from-existing')
    ? {
        report: existing,
        artifacts: {
          storageReportPath,
          storageMarkdownPath,
          publicSummaryPath,
          importDirectory: options.importDirectory,
        },
      }
    : await buildAffiliateReport(options)

  if (process.argv.includes('--from-existing')) {
    await writeText(storageMarkdownPath, buildAffiliateMarkdown(result.report))
    await writeJson(publicSummaryPath, buildAffiliatePublicSummary(result.report))
  }

  console.log(
    JSON.stringify(
      {
        status: result.report.status,
        clicks: result.report.summary.clicks,
        registrations: result.report.summary.registrations,
        ftb: result.report.summary.ftb,
        commission: result.report.summary.commission,
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
