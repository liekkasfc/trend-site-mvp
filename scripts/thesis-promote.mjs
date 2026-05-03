import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const thesisRegistryPath = path.join(projectRoot, 'config', 'thesis-registry.json')

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = 'true'
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function usage() {
  return [
    'Usage:',
    '  pnpm run thesis:promote -- --candidate <thesisKey> --domain <domain> [--site-slug <slug>]',
    '',
    'Example:',
    '  pnpm run thesis:promote -- --candidate agent-infrastructure --domain agents.example.com --site-slug ai-agent-infrastructure',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const candidateKey = (args.candidate ?? '').trim()
  const domain = (args.domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const siteSlug = (args['site-slug'] ?? '').trim()
  const dryRun = args['dry-run'] === 'true'

  if (!candidateKey || !domain) {
    console.error(usage())
    process.exitCode = 1
    return
  }

  const raw = await readFile(thesisRegistryPath, 'utf8')
  const payload = JSON.parse(raw)
  const theses = Array.isArray(payload.theses) ? payload.theses : []
  const target = theses.find((entry) => entry.thesisKey === candidateKey)

  if (!target) {
    console.error(`Candidate thesis "${candidateKey}" was not found in config/thesis-registry.json.`)
    process.exitCode = 1
    return
  }

  if (target.status === 'active' && target.domain === domain && target.siteSlug === (siteSlug || target.siteSlug)) {
    console.log(`Thesis "${candidateKey}" is already active on ${domain}.`)
    return
  }

  const nextPayload = {
    ...payload,
    theses: theses.map((entry) =>
      entry.thesisKey !== candidateKey
        ? entry
        : {
            ...entry,
            status: 'active',
            domain,
            siteSlug: siteSlug || entry.siteSlug || slugify(entry.label ?? candidateKey),
            promotedAt: new Date().toISOString(),
          },
    ),
  }

  if (dryRun) {
    console.log(JSON.stringify(nextPayload, null, 2))
    return
  }

  await writeFile(thesisRegistryPath, `${JSON.stringify(nextPayload, null, 2)}\n`)

  console.log(
    `Promoted thesis "${candidateKey}" to active with domain "${domain}" and site slug "${siteSlug || target.siteSlug}".`,
  )
}

await main()
