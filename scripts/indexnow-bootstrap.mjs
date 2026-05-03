import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import {
  createReleaseRunDirectory,
  parseArgs,
  projectRoot,
  resolveSiteBaseUrl,
  trimTrailingSlash,
  writeJson,
  writeText,
} from './release-lib.mjs'

function normalizeHost(hostname) {
  return String(hostname || '').trim().replace(/^www\./i, '')
}

function generateIndexNowKey() {
  return crypto.randomUUID()
}

function upsertEnvValue(contents, key, value) {
  const normalizedLine = `${key}=${value}`
  const linePattern = new RegExp(`^(?:#\\s*)?${key}=.*$`, 'm')

  if (linePattern.test(contents)) {
    return contents.replace(linePattern, normalizedLine)
  }

  const trailingNewline = contents.endsWith('\n') ? '' : '\n'
  return `${contents}${trailingNewline}${normalizedLine}\n`
}

function getIndexNowLocation({ siteBaseUrl, key, explicitKeyLocation = '' }) {
  const baseUrl = trimTrailingSlash(siteBaseUrl)
  const keyLocation = explicitKeyLocation.trim() || `${baseUrl}/${key}.txt`
  const keyUrl = new URL(keyLocation)
  const siteUrl = new URL(baseUrl)
  const relativePath = keyUrl.pathname.replace(/^\/+/, '')
  const localPath = path.join(projectRoot, 'public', relativePath)

  return {
    siteHost: normalizeHost(siteUrl.hostname),
    keyLocation,
    keyHost: normalizeHost(keyUrl.hostname),
    relativePath,
    localPath,
  }
}

function renderMarkdown(report) {
  const lines = [
    '# IndexNow Bootstrap',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Site base URL: ${report.siteBaseUrl}`,
    `- IndexNow host: ${report.indexNowHost || 'n/a'}`,
    `- IndexNow key: ${report.indexNowKey || 'n/a'}`,
    `- Key location: ${report.indexNowKeyLocation || 'n/a'}`,
    `- Key file path: ${report.keyFilePath || 'n/a'}`,
    '',
    '## Actions',
  ]

  for (const action of report.actions) {
    lines.push(`- ${action}`)
  }

  return `${lines.join('\n')}\n`
}

export async function runIndexNowBootstrap(options = {}) {
  const siteBaseUrl = resolveSiteBaseUrl(options.siteBaseUrl)
  const envPath = path.join(projectRoot, '.env')
  const existingEnv = await readFile(envPath, 'utf8')
  const currentKey = (process.env.INDEXNOW_KEY ?? '').trim()
  const currentHost = (process.env.INDEXNOW_HOST ?? '').trim()
  const currentKeyLocation = (process.env.INDEXNOW_KEY_LOCATION ?? '').trim()
  const writeEnv = options.writeEnv === true
  const requestedKey = String(options.key ?? '').trim()
  const requestedHost = String(options.host ?? '').trim()
  const requestedKeyLocation = String(options.keyLocation ?? '').trim()
  const generatedKey = !requestedKey && !currentKey && writeEnv
  const indexNowKey = requestedKey || currentKey || (generatedKey ? generateIndexNowKey() : '')
  const indexNowHost = requestedHost || currentHost || normalizeHost(new URL(siteBaseUrl).hostname)

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'prepared',
    siteBaseUrl,
    indexNowKey,
    indexNowHost,
    indexNowKeyLocation: '',
    keyFilePath: '',
    actions: [],
    envUpdated: false,
    keyGenerated: generatedKey,
    artifacts: {},
  }

  if (!indexNowKey) {
    report.status = 'skipped'
    report.actions.push('No INDEXNOW_KEY is configured. Re-run with --write-env to generate one.')
    return report
  }

  const location = getIndexNowLocation({
    siteBaseUrl,
    key: indexNowKey,
    explicitKeyLocation: requestedKeyLocation || currentKeyLocation,
  })

  report.indexNowKeyLocation = location.keyLocation
  report.keyFilePath = location.localPath

  if (location.keyHost !== location.siteHost) {
    report.status = 'warning'
    report.actions.push(
      `Key location host ${location.keyHost} does not match site host ${location.siteHost}; key file was not written locally.`,
    )
    return report
  }

  await mkdir(path.dirname(location.localPath), { recursive: true })
  await writeFile(location.localPath, `${indexNowKey}\n`, 'utf8')
  report.actions.push(`Wrote key file ${location.relativePath}.`)

  if (writeEnv) {
    let nextEnv = existingEnv
    nextEnv = upsertEnvValue(nextEnv, 'INDEXNOW_KEY', indexNowKey)
    nextEnv = upsertEnvValue(nextEnv, 'INDEXNOW_HOST', indexNowHost)
    nextEnv = upsertEnvValue(nextEnv, 'INDEXNOW_KEY_LOCATION', location.keyLocation)
    if (nextEnv !== existingEnv) {
      await writeFile(envPath, nextEnv, 'utf8')
      report.envUpdated = true
      report.actions.push('Updated .env with IndexNow key, host, and key location.')
    } else {
      report.actions.push('.env already matched the current IndexNow configuration.')
    }
  }

  report.status = 'pass'
  return report
}

async function main() {
  const args = parseArgs()
  const runDirectory = await createReleaseRunDirectory('indexnow-bootstrap')
  const report = await runIndexNowBootstrap({
    siteBaseUrl: args['site-base-url'],
    key: args.key,
    host: args.host,
    keyLocation: args['key-location'],
    writeEnv: args['write-env'] === true,
  })

  report.artifacts = {
    runDirectory,
    jsonReport: path.join(runDirectory, 'indexnow-bootstrap.json'),
    markdownReport: path.join(runDirectory, 'indexnow-bootstrap.md'),
  }

  await writeJson(report.artifacts.jsonReport, report)
  await writeText(report.artifacts.markdownReport, renderMarkdown(report))

  console.log(JSON.stringify(report, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
