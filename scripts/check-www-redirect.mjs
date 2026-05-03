import {
  baseDomainFromUrl,
  flag,
  fetchManual,
  normalizeList,
  normalizePublicPath,
  option,
  parseArgs,
  resolveSiteBaseUrl,
} from './release-lib.mjs'

export async function runWwwRedirectCheck(options = {}) {
  const siteBaseUrl = resolveSiteBaseUrl(options.siteBaseUrl)
  const apexOrigin = new URL(siteBaseUrl).origin
  const apexHost = baseDomainFromUrl(siteBaseUrl)
  const wwwDomain = options.wwwDomain || `www.${apexHost}`
  const expectedStatus = Number.parseInt(String(options.expectedStatus ?? 301), 10)
  const paths = options.paths?.length ? options.paths : ['/']
  const checks = []

  for (const inputPath of paths) {
    const publicPath = normalizePublicPath(inputPath)
    const sourceUrl = `https://${wwwDomain}${publicPath}`
    const expectedLocation = `${apexOrigin}${publicPath}`
    const response = await fetchManual(sourceUrl, { method: 'HEAD' })
    const location = response.headers.get('location') ?? ''
    const passed = response.status === expectedStatus && location === expectedLocation

    checks.push({
      path: publicPath,
      sourceUrl,
      expectedLocation,
      actualStatus: response.status,
      actualLocation: location,
      passed,
    })
  }

  const pass = checks.every((check) => check.passed)
  return {
    pass,
    apexOrigin,
    wwwDomain,
    expectedStatus,
    checks,
  }
}

async function main() {
  const args = parseArgs()
  const result = await runWwwRedirectCheck({
    siteBaseUrl: option(args, 'site-base-url'),
    wwwDomain: option(args, 'www-domain'),
    expectedStatus: option(args, 'expected-status', '301'),
    paths: normalizeList(option(args, 'paths')).length
      ? normalizeList(option(args, 'paths'))
      : normalizeList(option(args, 'path')),
  })

  console.log(JSON.stringify(result, null, 2))

  if (!result.pass && !flag(args, 'soft')) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
