import path from 'node:path'
import { appendFile } from 'node:fs/promises'

import { runDeliverHeadCheck } from './check-deliver-head.mjs'
import { runGa4RealtimeCheck, seedGa4BrowserHits } from './check-ga4-realtime.mjs'
import { runReleaseHealth } from './release-health.mjs'
import { runSeoDiagnostics } from './seo-diagnostics.mjs'
import { runSeoSubmit } from './seo-submit.mjs'
import { runSubmitTestLead } from './submit-test-lead.mjs'
import { runWwwRedirectCheck } from './check-www-redirect.mjs'
import {
  createReleaseRunDirectory,
  flag,
  getAssetFilePaths,
  getDefaultAssetSlug,
  getDefaultPagesBranch,
  getDefaultPagesProject,
  getDefaultSiteSlug,
  option,
  parseArgs,
  readJsonIfExists,
  readGaMeasurementId,
  projectRoot,
  resolveSiteBaseUrl,
  runCommand,
  runCommandCapture,
  trimTrailingSlash,
  writeJson,
  writeText,
} from './release-lib.mjs'
import {
  isProductionPublishAllowed,
  summarizePipelinePublishGate,
} from './publish-gate.mjs'

async function checkLiveLandingPage(siteBaseUrl, siteSlug, assetSlug) {
  const liveRoute = getAssetFilePaths(siteSlug, assetSlug).liveLandingRoute
  const response = await fetch(`${trimTrailingSlash(siteBaseUrl)}${liveRoute}`, {
    method: 'GET',
    redirect: 'follow',
  })

  return {
    pass: response.ok,
    url: `${trimTrailingSlash(siteBaseUrl)}${liveRoute}`,
    status: response.status,
  }
}

async function runReleaseHealthWithRetry(
  options,
  { healthRetryAttempts = 4, healthRetryDelayMs = 5000 } = {},
) {
  let health = null

  for (let attempt = 1; attempt <= healthRetryAttempts; attempt += 1) {
    health = await runReleaseHealth(options)
    if (health.overallStatus === 'pass' || attempt === healthRetryAttempts) {
      return { health, attempts: attempt }
    }

    await new Promise((resolve) => setTimeout(resolve, healthRetryDelayMs))
  }

  return { health, attempts: healthRetryAttempts }
}

function renderGa4SummaryLines(report) {
  const ga4Status = report.acceptance.ga4?.status ?? 'not_run'
  const lines = [`- GA4 realtime: ${ga4Status}`]
  if (report.acceptance.ga4?.checkedAt) {
    lines.push(`  - Checked at: ${report.acceptance.ga4.checkedAt}`)
    lines.push(`  - Events: ${(report.acceptance.ga4.expectedEvents ?? []).join(', ') || 'n/a'}`)
    lines.push(`  - Wait: ${report.acceptance.ga4.waitMs ?? 0}ms`)
    lines.push(`  - Judgement: ${report.acceptance.ga4.finalJudgement || report.acceptance.ga4.reason || 'n/a'}`)
  }
  return lines
}

export function renderMarkdownReport(report) {
  const liveLandingStatus = report.acceptance.liveLandingPage?.status ?? 'not_run'
  const redirectStatus = report.acceptance.wwwRedirect?.status ?? 'not_run'
  const deliveryStatus = report.acceptance.delivery?.status ?? 'not_run'
  const healthStatus = report.acceptance.health?.status ?? 'not_run'
  const seoDiagnosticsStatus = report.acceptance.seoDiagnostics?.status ?? 'not_run'
  const seoSubmissionStatus = report.acceptance.seoSubmission?.status ?? 'not_run'
  const lines = [
    '# Automiora Release Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Site base URL: ${report.siteBaseUrl}`,
    `- Pages project: ${report.pagesProject}`,
    `- Site slug: ${report.siteSlug}`,
    `- Asset slug: ${report.assetSlug}`,
    `- Overall status: ${report.overallStatus}`,
    '',
    '## Deploy steps',
  ]

  for (const step of report.deploySteps) {
    lines.push(`- ${step.name}: ${step.status}`)
    if (step.detail) {
      lines.push(`  - ${step.detail}`)
    }
  }

  lines.push('')
  lines.push('## Acceptance')
  lines.push(`- Site/API health: ${healthStatus}`)
  lines.push(`- Apex landing page: ${liveLandingStatus}`)
  lines.push(`- www redirect: ${redirectStatus}`)
  lines.push(`- Deliver HEAD + GET: ${deliveryStatus}`)
  lines.push(`- SEO diagnostics: ${seoDiagnosticsStatus}`)
  lines.push(`- SEO submit: ${seoSubmissionStatus}`)
  lines.push(...renderGa4SummaryLines(report))
  lines.push('')
  lines.push('## Lead test')
  lines.push(`- Lead id: ${report.acceptance.delivery?.leadId || 'n/a'}`)
  lines.push(`- Delivery token: ${report.acceptance.delivery?.deliveryToken || 'n/a'}`)
  lines.push(`- Test email: ${report.acceptance.delivery?.email || 'n/a'}`)

  if (report.acceptance.ga4?.missingEvents?.length) {
    lines.push('')
    lines.push('## GA4 follow-up')
    lines.push(
      `- Missing realtime events: ${report.acceptance.ga4.missingEvents.join(', ')}`,
    )
    lines.push(
      '- This usually means the backend smoke passed, but the live browser CTA/form/download path was not exercised in the last 30 minutes.',
    )
  }

  return `${lines.join('\n')}\n`
}

export function renderActionsSummary(report) {
  return [
    '## Automiora Release',
    '',
    `- Overall status: ${report.overallStatus}`,
    `- Publish gate: ${report.acceptance.publishGate?.status ?? 'not_run'}`,
    ...renderGa4SummaryLines(report),
    '',
  ].join('\n')
}

export async function readPipelinePublishGate(siteSlug) {
  const pipelineReport = await readJsonIfExists(
    path.join(projectRoot, 'public', 'generated', 'pipeline-report.json'),
    null,
  )
  return summarizePipelinePublishGate(pipelineReport, siteSlug)
}

async function writeReleaseReports(report) {
  await writeJson(report.artifacts.jsonReport, report)
  await writeText(report.artifacts.markdownReport, renderMarkdownReport(report))
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, renderActionsSummary(report), 'utf8')
  }
}

async function runReleaseSteps(sequence, report) {
  for (const [name, [command, commandArgs]] of sequence) {
    try {
      await runCommand(command, commandArgs)
      report.deploySteps.push({ name, status: 'pass' })
    } catch (error) {
      report.deploySteps.push({
        name,
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
      })
      report.overallStatus = 'fail'
      await writeReleaseReports(report)
      throw error
    }
  }
}

async function main() {
  const args = parseArgs()
  const skipLint = flag(args, 'skip-lint')
  const skipPipeline = flag(args, 'skip-pipeline')
  const skipBuild = flag(args, 'skip-build')
  const siteSlug = option(args, 'site-slug', getDefaultSiteSlug())
  const assetSlug = option(args, 'asset-slug', getDefaultAssetSlug())
  const siteBaseUrl = resolveSiteBaseUrl(option(args, 'site-base-url'))
  const pagesProject = option(args, 'pages-project', getDefaultPagesProject())
  const pagesBranch = option(args, 'pages-branch', getDefaultPagesBranch())
  const runDirectory = await createReleaseRunDirectory(`prod-${siteSlug}`)
  const latestSuccessfulReleasePath = path.join(
    projectRoot,
    'storage',
    'release-runs',
    'latest-successful.json',
  )
  let fatalError = null
  const report = {
    generatedAt: new Date().toISOString(),
    siteBaseUrl,
    pagesProject,
    siteSlug,
    assetSlug,
    deploySteps: [],
    acceptance: {},
    artifacts: {
      runDirectory,
      jsonReport: path.join(runDirectory, 'report.json'),
      markdownReport: path.join(runDirectory, 'report.md'),
      latestSuccessfulReleasePath,
    },
    previousSuccessfulRelease: await readJsonIfExists(latestSuccessfulReleasePath, null),
    overallStatus: 'running',
  }

  const preflightSequence = [
    ...(skipLint ? [] : [['lint', ['pnpm', ['run', 'lint']]]]),
    ...(skipPipeline ? [] : [['pipeline', ['pnpm', ['run', 'pipeline']]]]),
    ['homepage:gate', ['pnpm', ['run', 'homepage:gate']]],
    ['site:thesis-gate', ['pnpm', ['run', 'site:thesis-gate']]],
    ['seo:indexnow:init', ['pnpm', ['run', 'seo:indexnow:init']]],
    ...(skipBuild ? [] : [['build', ['pnpm', ['run', 'build']]]]),
  ]
  const deploymentSequence = [
    ['worker:r2:sync', ['pnpm', ['run', 'worker:r2:sync']]],
    ['worker:d1:migrate', ['pnpm', ['run', 'worker:d1:migrate']]],
    ['worker:deploy', ['pnpm', ['run', 'worker:deploy']]],
  ]

  await runReleaseSteps(preflightSequence, report)

  const publishGate = await readPipelinePublishGate(siteSlug)
  report.acceptance.publishGate = publishGate
  report.deploySteps.push({
    name: 'publish:gate',
    status: publishGate.status,
    detail:
      publishGate.status === 'pass'
        ? 'Publish gate is pass.'
        : `${publishGate.status}: ${publishGate.reasons.join('; ') || 'No publishable gate state found.'}`,
  })
  if (!isProductionPublishAllowed(publishGate.status)) {
    report.overallStatus = 'fail'
    await writeReleaseReports(report)
    throw new Error(`Publish gate blocked production deploy: ${publishGate.status}`)
  }

  await runReleaseSteps(deploymentSequence, report)

  try {
    const deployment = await runCommandCapture('pnpm', [
      'exec',
      'wrangler',
      'pages',
      'deploy',
      'dist',
      '--project-name',
      pagesProject,
      '--branch',
      pagesBranch,
    ])
    report.deploySteps.push({
      name: 'pages:deploy',
      status: 'pass',
      detail: deployment.stdout.trim().split('\n').slice(-1)[0] || 'Pages deploy completed.',
    })
  } catch (error) {
    report.deploySteps.push({
      name: 'pages:deploy',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    })
    report.overallStatus = 'fail'
    await writeReleaseReports(report)
    throw error
  }

  try {
    const { health, attempts } = await runReleaseHealthWithRetry({
      siteSlug,
      assetSlug,
      siteBaseUrl,
    })
    report.acceptance.health = {
      status: health.overallStatus,
      checks: health.checks,
      attempts,
    }
    report.deploySteps.push({
      name: 'release:health',
      status: health.overallStatus === 'pass' ? 'pass' : 'fail',
      detail: `${health.checks.filter((check) => check.ok).length}/${health.checks.length} checks passed after ${attempts} attempt(s).`,
    })
    if (health.overallStatus !== 'pass') {
      fatalError ??= new Error('Release health checks failed.')
    }
  } catch (error) {
    report.acceptance.health = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    report.deploySteps.push({
      name: 'release:health',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    })
    fatalError ??= error
  }

  try {
    const liveLandingPage = await checkLiveLandingPage(siteBaseUrl, siteSlug, assetSlug)
    report.acceptance.liveLandingPage = {
      status: liveLandingPage.pass ? 'pass' : 'fail',
      url: liveLandingPage.url,
      httpStatus: liveLandingPage.status,
    }
    if (!liveLandingPage.pass) {
      fatalError ??= new Error(`Live landing page check failed for ${liveLandingPage.url}`)
    }
  } catch (error) {
    report.acceptance.liveLandingPage = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    fatalError ??= error
  }

  try {
    const redirectCheck = await runWwwRedirectCheck({
      siteBaseUrl,
      paths: ['/', getAssetFilePaths(siteSlug, assetSlug).liveLandingRoute],
    })
    report.acceptance.wwwRedirect = {
      status: redirectCheck.pass ? 'pass' : 'fail',
      checks: redirectCheck.checks,
    }
    if (!redirectCheck.pass) {
      fatalError ??= new Error('www redirect check failed.')
    }
  } catch (error) {
    report.acceptance.wwwRedirect = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    fatalError ??= error
  }

  try {
    const seoDiagnostics = await runSeoDiagnostics()
    report.acceptance.seoDiagnostics = {
      status: seoDiagnostics.overallStatus,
      summary: seoDiagnostics.summary,
    }
    report.deploySteps.push({
      name: 'seo:diagnostics',
      status: seoDiagnostics.overallStatus === 'pass' ? 'pass' : 'warning',
      detail: `${seoDiagnostics.summary.canonicalMatches}/${seoDiagnostics.summary.queuedUrls} queued URLs have exact canonical coverage.`,
    })
  } catch (error) {
    report.acceptance.seoDiagnostics = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    report.deploySteps.push({
      name: 'seo:diagnostics',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    })
    fatalError ??= error
  }

  try {
    const leadResult = await runSubmitTestLead({
      siteSlug,
      assetSlug,
    })
    const deliveryResult = await runDeliverHeadCheck({
      leadId: leadResult.leadId,
      deliveryToken: leadResult.deliveryToken,
      verifyGet: true,
    })
    report.acceptance.delivery = {
      status: deliveryResult.pass ? 'pass' : 'fail',
      leadId: leadResult.leadId,
      deliveryToken: leadResult.deliveryToken,
      email: leadResult.email,
      deliveryUrl: leadResult.deliveryUrl,
      headStatus: deliveryResult.head.status,
      getStatus: deliveryResult.get?.status ?? null,
      preservedDeliveryState: deliveryResult.head.preservedDeliveryState,
      incrementedDeliveryState: deliveryResult.get?.incrementedDeliveryState ?? false,
    }
    if (!deliveryResult.pass) {
      fatalError ??= new Error('Delivery HEAD/GET validation failed.')
    }
  } catch (error) {
    report.acceptance.delivery = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    fatalError ??= error
  }

  try {
    const seoSubmission = await runSeoSubmit()
    report.acceptance.seoSubmission = {
      status: seoSubmission.overallStatus,
      engines: seoSubmission.engines,
      queueSize: seoSubmission.queueSize,
    }
    report.deploySteps.push({
      name: 'seo:submit',
      status:
        seoSubmission.overallStatus === 'pass'
          ? 'pass'
          : seoSubmission.overallStatus === 'partial'
            ? 'warning'
            : 'warning',
      detail: seoSubmission.engines
        .map((engine) => `${engine.key}:${engine.status}`)
        .join(', '),
    })
  } catch (error) {
    report.acceptance.seoSubmission = {
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    }
    report.deploySteps.push({
      name: 'seo:submit',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  let ga4Warmup = null
  let ga4Check = await runGa4RealtimeCheck({
    siteSlug,
    assetSlug,
  }).catch((error) => ({
    pass: false,
    status: 'fail',
    checkedAt: new Date().toISOString(),
    waitMs: 0,
    error: error instanceof Error ? error.message : String(error),
    finalJudgement: 'GA4 realtime validation failed before a report could be produced.',
    missingEvents: [],
  }))

  if (['delayed', 'warning'].includes(ga4Check.status)) {
    ga4Warmup = await seedGa4BrowserHits({
      siteSlug,
      assetSlug,
      settleMs: 8000,
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
      hits: [],
    }))

    ga4Check = await runGa4RealtimeCheck({
      siteSlug,
      assetSlug,
      waitMs: 8000,
    }).catch((error) => ({
      pass: false,
      status: 'fail',
      checkedAt: new Date().toISOString(),
      waitMs: 8000,
      error: error instanceof Error ? error.message : String(error),
      finalJudgement: 'GA4 realtime validation failed after the warmup wait.',
      missingEvents: [],
    }))
  }

  report.acceptance.ga4 = {
    status: ga4Check.status ?? (ga4Check.pass ? 'pass' : 'fail'),
    checkedAt: ga4Check.checkedAt ?? new Date().toISOString(),
    waitMs: ga4Check.waitMs ?? 0,
    propertyId: ga4Check.propertyId ?? process.env.GA4_PROPERTY_ID ?? '',
    measurementId:
      ga4Check.measurementId ||
      (await readGaMeasurementId(getAssetFilePaths(siteSlug, assetSlug).localLandingFile).catch(
        () => '',
      )),
    activeUsers: ga4Check.activeUsers ?? 0,
    eventCounts: ga4Check.eventCounts ?? {},
    expectedEvents: ga4Check.expectedEvents ?? [],
    pageTitleViews: ga4Check.pageTitleViews ?? {},
    missingEvents: ga4Check.missingEvents ?? [],
    matchedPageTitles: ga4Check.matchedPageTitles ?? [],
    error: ga4Check.error ?? '',
    reason: ga4Check.reason ?? '',
    finalJudgement: ga4Check.finalJudgement ?? '',
    warmup:
      ga4Warmup && ga4Warmup.hits?.length
        ? {
            hitCount: ga4Warmup.hits.length,
            statuses: ga4Warmup.hits.map((hit) => `${hit.event}:${hit.status}`),
            error: ga4Warmup.error ?? '',
          }
        : undefined,
  }

  const essentialPass =
    report.acceptance.health?.status === 'pass' &&
    report.acceptance.liveLandingPage.status === 'pass' &&
    report.acceptance.wwwRedirect.status === 'pass' &&
    report.acceptance.delivery.status === 'pass'
  const secondaryPass =
    report.acceptance.ga4.status === 'pass' &&
    report.acceptance.seoDiagnostics?.status === 'pass' &&
    ['pass', 'partial'].includes(report.acceptance.seoSubmission?.status ?? '')

  report.overallStatus = essentialPass ? (secondaryPass ? 'pass' : 'warning') : 'fail'

  await writeReleaseReports(report)

  if (!fatalError && report.overallStatus !== 'fail') {
    await writeJson(latestSuccessfulReleasePath, report)
  }

  if (fatalError) {
    throw fatalError
  }

  console.log(JSON.stringify(report, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
