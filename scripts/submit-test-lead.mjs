import {
  flag,
  getAssetFilePaths,
  makeUniqueEmail,
  option,
  parseArgs,
  readHtmlTitle,
  resolveApiBaseUrl,
  toTitleCaseSlug,
} from './release-lib.mjs'

export async function runSubmitTestLead(options = {}) {
  const siteSlug = options.siteSlug
  const assetSlug = options.assetSlug
  if (!siteSlug || !assetSlug) {
    throw new Error('siteSlug and assetSlug are required.')
  }

  if ((process.env.TURNSTILE_REQUIRED ?? '').toLowerCase() === 'true' && !options.turnstileToken) {
    throw new Error(
      'TURNSTILE_REQUIRED=true. Provide --turnstile-token or temporarily disable strict Turnstile for release validation.',
    )
  }

  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl)
  const paths = getAssetFilePaths(siteSlug, assetSlug)
  const landingTitle = await readHtmlTitle(paths.localLandingFile)
  const assetTitle =
    options.assetTitle ||
    landingTitle.replace(/\s+delivery$/i, '').trim() ||
    `${toTitleCaseSlug(siteSlug)} ${toTitleCaseSlug(assetSlug)}`

  const payload = {
    email: options.email || makeUniqueEmail(`release-${assetSlug}`),
    role: options.role || 'Release validation',
    useCase: options.useCase || `release smoke for ${siteSlug}/${assetSlug}`,
    siteSlug,
    assetSlug,
    sourcePage: options.sourcePage || paths.publicLandingPath,
    thankYouPath: options.thankYouPath || paths.publicThankYouPath,
    assetTitle,
    landingPath: options.landingPath || paths.publicLandingPath,
    turnstileToken: options.turnstileToken || '',
  }

  const response = await fetch(`${apiBaseUrl}/v1/asset-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const bodyText = await response.text()
  const body = bodyText ? JSON.parse(bodyText) : {}
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${bodyText}`)
  }

  return {
    pass: true,
    apiBaseUrl,
    siteSlug,
    assetSlug,
    email: payload.email,
    role: payload.role,
    useCase: payload.useCase,
    assetTitle,
    landingTitle,
    leadId: body.submissionId,
    deliveryToken: body.deliveryToken,
    redirectUrl: body.redirectUrl,
    fallbackDownloadUrl: body.fallbackDownloadUrl,
    deliveryUrl: `${apiBaseUrl}/v1/deliver/${body.deliveryToken}`,
    paths,
  }
}

async function main() {
  const args = parseArgs()
  const result = await runSubmitTestLead({
    apiBaseUrl: option(args, 'api-base-url'),
    siteSlug: option(args, 'site-slug'),
    assetSlug: option(args, 'asset-slug'),
    email: option(args, 'email'),
    role: option(args, 'role'),
    useCase: option(args, 'use-case'),
    assetTitle: option(args, 'asset-title'),
    sourcePage: option(args, 'source-page'),
    thankYouPath: option(args, 'thank-you-path'),
    landingPath: option(args, 'landing-path'),
    turnstileToken: option(args, 'turnstile-token'),
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
