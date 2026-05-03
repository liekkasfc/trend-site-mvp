import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'

if (typeof process.loadEnvFile === 'function') {
  const dotEnvPath = path.join(process.cwd(), '.env')
  if (existsSync(dotEnvPath)) {
    process.loadEnvFile(dotEnvPath)
  }
}

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''
const port = Number.parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT ?? '4815', 10)
const redirectUri =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${port}/oauth2/callback`
const tokenUrls = [
  process.env.GOOGLE_OAUTH_TOKEN_URL ?? '',
  'https://oauth2.googleapis.com/token',
  'https://accounts.google.com/o/oauth2/token',
].filter(Boolean)
const scopes = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly',
]

if (!clientId || !clientSecret) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env. Create a Google OAuth Desktop client first.',
  )
  process.exit(1)
}

const state = randomBytes(16).toString('hex')
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')
authUrl.searchParams.set('include_granted_scopes', 'true')
authUrl.searchParams.set('scope', scopes.join(' '))
authUrl.searchParams.set('state', state)

async function exchangeCodeForTokens(code) {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })

  const errors = []
  for (const tokenUrl of tokenUrls) {
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TrendSitePipeline/1.0',
        },
        body: form.toString(),
      })

      if (!response.ok) {
        errors.push(`${tokenUrl} -> ${response.status} ${await response.text()}`)
        continue
      }

      return response.json()
    } catch (error) {
      errors.push(`${tokenUrl} -> ${error instanceof Error ? error.message : 'Unknown token error'}`)
    }
  }

  throw new Error(errors.join(' | '))
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      throw new Error('Missing callback URL.')
    }

    const callbackUrl = new URL(request.url, redirectUri)
    const returnedState = callbackUrl.searchParams.get('state')
    const error = callbackUrl.searchParams.get('error')
    const code = callbackUrl.searchParams.get('code')

    if (callbackUrl.pathname !== new URL(redirectUri).pathname) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    if (error) {
      throw new Error(`Google returned error=${error}`)
    }

    if (!code || returnedState !== state) {
      throw new Error('OAuth callback validation failed.')
    }

    const tokenPayload = await exchangeCodeForTokens(code)
    const refreshToken = tokenPayload.refresh_token

    if (!refreshToken) {
      throw new Error(
        'No refresh_token returned. Remove prior app consent from Google Account permissions and retry so Google issues a new offline token.',
      )
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h1>OAuth connected</h1>
          <p>You can return to the terminal. A refresh token was received.</p>
        </body>
      </html>
    `)

    console.log('')
    console.log('Copy these values into .env:')
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`)
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`)
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`)
    console.log(`GOOGLE_OAUTH_REDIRECT_URI=${redirectUri}`)
    console.log('')

    server.close(() => process.exit(0))
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h1>OAuth failed</h1>
          <pre>${String(error)}</pre>
        </body>
      </html>
    `)

    console.error(error instanceof Error ? error.message : String(error))
    server.close(() => process.exit(1))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log('Google OAuth bootstrap is waiting for consent.')
  console.log(`Open this URL in your browser:\n${authUrl.toString()}`)
  console.log('')
  console.log(`Expected redirect URI: ${redirectUri}`)
})
