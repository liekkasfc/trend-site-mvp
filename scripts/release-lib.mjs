import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const projectRoot = path.resolve(__dirname, '..')
export const workerConfigPath = path.join(projectRoot, 'workers', 'automiora-api', 'wrangler.toml')

const googleTokenCache = new Map()
let envLoaded = false

export function loadProjectEnv() {
  if (envLoaded) return
  envLoaded = true
  if (typeof process.loadEnvFile !== 'function') return
  const dotEnvPath = path.join(projectRoot, '.env')
  if (existsSync(dotEnvPath)) {
    process.loadEnvFile(dotEnvPath)
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      parsed._.push(token)
      continue
    }

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

export function option(args, key, fallback = '') {
  const value = args[key]
  if (value === undefined || value === true) return fallback
  return String(value)
}

export function flag(args, key, fallback = false) {
  const value = args[key]
  if (value === undefined) return fallback
  if (value === true) return true
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())
}

export function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

export function normalizePublicPath(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return '/'
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((entry) => normalizeList(entry))
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function baseDomainFromUrl(siteBaseUrl) {
  const host = new URL(siteBaseUrl).host
  return host.replace(/^www\./i, '')
}

export function resolveSiteBaseUrl(explicitValue = '') {
  loadProjectEnv()
  return trimTrailingSlash(explicitValue || process.env.SITE_BASE_URL || 'https://automiora.com')
}

export function resolveApiBaseUrl(explicitValue = '') {
  loadProjectEnv()
  if (explicitValue) return trimTrailingSlash(explicitValue)
  if (process.env.DELIVERY_API_BASE_URL) return trimTrailingSlash(process.env.DELIVERY_API_BASE_URL)
  const domain = baseDomainFromUrl(resolveSiteBaseUrl())
  return `https://api.${domain}`
}

export function getDefaultPagesProject() {
  loadProjectEnv()
  return process.env.CLOUDFLARE_PAGES_PROJECT ?? 'automiora-site'
}

export function getDefaultPagesBranch() {
  loadProjectEnv()
  return process.env.CLOUDFLARE_PAGES_BRANCH ?? 'main'
}

export function getDefaultD1Database() {
  loadProjectEnv()
  return process.env.CLOUDFLARE_D1_DATABASE ?? 'automiora-site-prod'
}

export function getDefaultSiteSlug() {
  loadProjectEnv()
  return process.env.RELEASE_SITE_SLUG ?? 'ai-video-workflow-short-form-demo'
}

export function getDefaultAssetSlug() {
  loadProjectEnv()
  return process.env.RELEASE_ASSET_SLUG ?? 'prompt-pack'
}

export function toTitleCaseSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

export function makeUniqueEmail(prefix = 'release') {
  const stamp = timestampSlug().replace(/[^0-9a-z-]/gi, '').toLowerCase()
  const suffix = crypto.randomBytes(3).toString('hex')
  return `${prefix}-${stamp}-${suffix}@example.com`
}

export async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true })
  return directoryPath
}

export async function createReleaseRunDirectory(label = 'prod') {
  const directoryPath = path.join(projectRoot, 'storage', 'release-runs', `${timestampSlug()}-${label}`)
  await ensureDirectory(directoryPath)
  return directoryPath
}

export async function writeJson(filePath, value) {
  await ensureDirectory(path.dirname(filePath))
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function writeText(filePath, value) {
  await ensureDirectory(path.dirname(filePath))
  await writeFile(filePath, value, 'utf8')
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8')
}

export async function readJsonIfExists(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents)
}

export async function runCommand(command, args, options = {}) {
  const { cwd = projectRoot, env = process.env } = options
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
  })
}

export async function runCommandCapture(command, args, options = {}) {
  const { cwd = projectRoot, env = process.env } = options

  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env,
      maxBuffer: 16 * 1024 * 1024,
    })
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  } catch (error) {
    const stdout = error.stdout ?? ''
    const stderr = error.stderr ?? ''
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n')
    throw new Error(detail || `${command} ${args.join(' ')} failed`)
  }
}

export async function runCommandJson(command, args, options = {}) {
  const { stdout } = await runCommandCapture(command, args, options)
  return JSON.parse(stdout.trim())
}

export async function queryD1(sql, options = {}) {
  const databaseName = options.databaseName ?? getDefaultD1Database()
  const configPath = options.configPath ?? workerConfigPath
  const payload = await runCommandJson(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--json',
      '--config',
      configPath,
      '--command',
      sql,
    ],
    { cwd: projectRoot },
  )

  return Array.isArray(payload) ? payload[0]?.results ?? [] : payload?.results ?? []
}

export async function executeD1(sql, options = {}) {
  const databaseName = options.databaseName ?? getDefaultD1Database()
  const configPath = options.configPath ?? workerConfigPath
  return runCommandJson(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--json',
      '--config',
      configPath,
      '--command',
      sql,
    ],
    { cwd: projectRoot },
  )
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while requesting ${url}: ${await response.text()}`)
  }
  return response.json()
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while requesting ${url}: ${await response.text()}`)
  }
  return response.text()
}

export async function fetchManual(url, options = {}) {
  return fetch(url, {
    redirect: 'manual',
    ...options,
  })
}

export function getAssetFilePaths(siteSlug, assetSlug) {
  const publicAssetDirectory = path.join(projectRoot, 'public', assetSlug)
  const publicThankYouDirectory = path.join(publicAssetDirectory, 'ready')
  const publicLandingPath = `/${assetSlug}/`
  const publicThankYouPath = `/${assetSlug}/ready/`

  return {
    localLandingFile: path.join(publicAssetDirectory, 'index.html'),
    localThankYouFile: path.join(publicThankYouDirectory, 'index.html'),
    publicLandingPath,
    publicThankYouPath,
    liveLandingRoute: publicLandingPath,
    liveLandingHtmlRoute: `${publicLandingPath}index.html`,
    previewLandingRoute: `/generated-sites/${siteSlug}/asset-${assetSlug}`,
    previewThankYouRoute: `/generated-sites/${siteSlug}/asset-${assetSlug}-thank-you.html`,
  }
}

export async function readHtmlTitle(filePath) {
  const contents = await readText(filePath)
  const match = contents.match(/<title>([^<]+)<\/title>/i)
  if (!match) {
    throw new Error(`Could not find <title> in ${filePath}`)
  }
  return match[1].trim()
}

export async function readGaMeasurementId(filePath) {
  const contents = await readText(filePath)
  const match = contents.match(/gtag\/js\?id=([A-Z0-9-]+)/i) ?? contents.match(/gtag\('config',\s*"([A-Z0-9-]+)"/i)
  return match?.[1] ?? ''
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function googleConfig() {
  loadProjectEnv()
  return {
    authPreference: process.env.GOOGLE_AUTH_PREFERENCE ?? '',
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    oauthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? '',
    oauthTokenUrls: [
      process.env.GOOGLE_OAUTH_TOKEN_URL ?? '',
      'https://oauth2.googleapis.com/token',
      'https://accounts.google.com/o/oauth2/token',
    ].filter(Boolean),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
    serviceAccountPrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    ga4PropertyId: process.env.GA4_PROPERTY_ID ?? '',
  }
}

function hasGoogleUserOAuthAuth(config) {
  return Boolean(config.oauthClientId && config.oauthClientSecret && config.oauthRefreshToken)
}

function hasGoogleServiceAccountAuth(config) {
  return Boolean(config.serviceAccountEmail && config.serviceAccountPrivateKey)
}

export function hasAnyGoogleAuth() {
  const config = googleConfig()
  return hasGoogleUserOAuthAuth(config) || hasGoogleServiceAccountAuth(config)
}

export function getGoogleAuthMissingNote() {
  return 'Add GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN, or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
}

function preferredGoogleAuthModes(config) {
  const availableModes = []
  if (hasGoogleUserOAuthAuth(config)) availableModes.push('oauth_user')
  if (hasGoogleServiceAccountAuth(config)) availableModes.push('service_account')

  const preference = String(config.authPreference ?? '').trim().toLowerCase()
  const defaultPreference = process.env.GITHUB_ACTIONS === 'true' ? 'service_account_first' : 'oauth_user_first'
  const effectivePreference = preference || defaultPreference

  if (effectivePreference === 'service_account_only') {
    return availableModes.filter((mode) => mode === 'service_account')
  }

  if (effectivePreference === 'oauth_user_only') {
    return availableModes.filter((mode) => mode === 'oauth_user')
  }

  if (effectivePreference === 'service_account_first') {
    return availableModes.sort((left, right) => {
      if (left === right) return 0
      return left === 'service_account' ? -1 : 1
    })
  }

  return availableModes.sort((left, right) => {
    if (left === right) return 0
    return left === 'oauth_user' ? -1 : 1
  })
}

export async function getGoogleAccessToken(scopes) {
  const config = googleConfig()
  if (!hasGoogleUserOAuthAuth(config) && !hasGoogleServiceAccountAuth(config)) {
    throw new Error(getGoogleAuthMissingNote())
  }

  const normalizedScopes = [...new Set(scopes)].sort()
  const tokenErrors = []
  const authModes = preferredGoogleAuthModes(config)

  for (const authMode of authModes) {
    const scopeKey = [authMode, ...normalizedScopes].sort().join(' ')
    const cached = googleTokenCache.get(scopeKey)
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken
    }

    const form = authMode === 'oauth_user'
      ? new URLSearchParams({
          client_id: config.oauthClientId,
          client_secret: config.oauthClientSecret,
          refresh_token: config.oauthRefreshToken,
          grant_type: 'refresh_token',
        })
      : (() => {
          const now = Math.floor(Date.now() / 1000)
          const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
          const payload = base64UrlEncode(
            JSON.stringify({
              iss: config.serviceAccountEmail,
              scope: normalizedScopes.join(' '),
              aud: 'https://oauth2.googleapis.com/token',
              exp: now + 3600,
              iat: now,
            }),
          )
          const assertionBase = `${header}.${payload}`
          const signature = crypto
            .sign('RSA-SHA256', Buffer.from(assertionBase), config.serviceAccountPrivateKey)
            .toString('base64url')

          return new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: `${assertionBase}.${signature}`,
          })
        })()

    for (const tokenUrl of config.oauthTokenUrls) {
      try {
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'AutomioraRelease/1.0',
          },
          body: form.toString(),
        })

        if (!response.ok) {
          tokenErrors.push(`${authMode}:${tokenUrl} -> ${response.status} ${await response.text()}`)
          continue
        }

        const payload = await response.json()
        const expiresIn = Number(payload.expires_in ?? 3600)
        googleTokenCache.set(scopeKey, {
          accessToken: payload.access_token,
          expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
        })

        return payload.access_token
      } catch (error) {
        tokenErrors.push(
          `${authMode}:${tokenUrl} -> ${error instanceof Error ? error.message : 'Unknown token error'}`,
        )
        continue
      }
    }
  }

  throw new Error(
    `Google OAuth token exchange failed across ${authModes.length} auth mode(s) and ${config.oauthTokenUrls.length} endpoint(s): ${tokenErrors.join(' | ')}`,
  )
}

export async function runRealtimeReport(body, explicitPropertyId = '') {
  const config = googleConfig()
  const propertyId = explicitPropertyId || config.ga4PropertyId
  if (!propertyId) {
    throw new Error('Set GA4_PROPERTY_ID before running GA4 realtime checks.')
  }

  const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/analytics.readonly'])
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }

  return response.json()
}

export function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function summarizeMetricRows(rows, dimensionIndex = 0, metricIndex = 0) {
  const summary = {}
  for (const row of rows ?? []) {
    const key = row.dimensionValues?.[dimensionIndex]?.value ?? ''
    if (!key) continue
    summary[key] = toNumber(row.metricValues?.[metricIndex]?.value, 0)
  }
  return summary
}

export async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
