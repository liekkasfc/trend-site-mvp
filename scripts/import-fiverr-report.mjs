import { buildAffiliateReport, defaultImportDirectory } from './build-affiliate-report.mjs'

function parseArgs(argv) {
  const options = {
    importDirectory: defaultImportDirectory,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--import-dir' && argv[index + 1]) {
      options.importDirectory = argv[index + 1]
      index += 1
    }
  }
  return options
}

async function main() {
  const result = await buildAffiliateReport(parseArgs(process.argv.slice(2)))
  console.log(
    JSON.stringify(
      {
        status: result.report.status,
        clicks: result.report.summary.clicks,
        registrations: result.report.summary.registrations,
        ftb: result.report.summary.ftb,
        commission: result.report.summary.commission,
        importDirectory: result.artifacts.importDirectory,
        storageReportPath: result.artifacts.storageReportPath,
        publicSummaryPath: result.artifacts.publicSummaryPath,
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
