import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = path.join(projectRoot, 'public', 'generated', 'pipeline-determinism.json')
const fixedNow = process.env.PIPELINE_FIXED_NOW || '2026-07-21T00:00:00.000Z'
const allowedTrackedPrefixes = ['public/generated/', 'storage/release-runs/']

function isAllowedTrackedPath(filePath) {
  return allowedTrackedPrefixes.some((prefix) => filePath.startsWith(prefix))
}

async function git(args, options = {}) {
  return execFileAsync('git', args, {
    cwd: projectRoot,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
}

async function listTrackedFiles() {
  const { stdout } = await git(['ls-files', '-z'], { encoding: 'buffer' })
  return stdout
    .toString('utf8')
    .split('\0')
    .filter((filePath) => filePath && !isAllowedTrackedPath(filePath))
    .sort((left, right) => left.localeCompare(right, 'en'))
}

async function snapshotTrackedFiles() {
  const snapshot = new Map()
  for (const filePath of await listTrackedFiles()) {
    const content = await readFile(path.join(projectRoot, filePath)).catch(() => null)
    snapshot.set(
      filePath,
      content ? crypto.createHash('sha256').update(content).digest('hex') : 'missing',
    )
  }
  return snapshot
}

function compareSnapshots(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()])
  return [...paths]
    .filter((filePath) => before.get(filePath) !== after.get(filePath))
    .sort((left, right) => left.localeCompare(right, 'en'))
}

async function trackedStatusPaths() {
  const { stdout } = await git(['status', '--porcelain=v1', '--untracked-files=no'])
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').at(-1))
    .filter((filePath) => filePath && !isAllowedTrackedPath(filePath))
    .sort((left, right) => left.localeCompare(right, 'en'))
}

async function runPipeline(label) {
  const startedAt = Date.now()
  const { stdout, stderr } = await execFileAsync(process.execPath, ['scripts/run-pipeline.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PIPELINE_OFFLINE_FIXTURES: 'true',
      PIPELINE_FIXED_NOW: fixedNow,
      SITE_BASE_URL: process.env.SITE_BASE_URL || 'https://automiora.com',
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  return {
    label,
    durationMs: Date.now() - startedAt,
    outputTail: [...stdout.split('\n'), ...stderr.split('\n')].filter(Boolean).slice(-12),
  }
}

async function writeReport(report) {
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

export async function checkPipelineDeterminism() {
  const initialDirtyPaths = await trackedStatusPaths()
  if (initialDirtyPaths.length > 0) {
    const report = {
      status: 'fail',
      fixedNow,
      reason: 'Tracked worktree must be clean before the determinism check.',
      initialDirtyPaths,
      runs: [],
    }
    await writeReport(report)
    return report
  }

  const before = await snapshotTrackedFiles()
  const firstRun = await runPipeline('first')
  const afterFirst = await snapshotTrackedFiles()
  const firstRunChangedPaths = compareSnapshots(before, afterFirst)

  const secondRun = await runPipeline('second')
  const afterSecond = await snapshotTrackedFiles()
  const secondRunChangedPaths = compareSnapshots(afterFirst, afterSecond)
  const finalDirtyPaths = await trackedStatusPaths()
  const status =
    firstRunChangedPaths.length === 0 &&
    secondRunChangedPaths.length === 0 &&
    finalDirtyPaths.length === 0
      ? 'pass'
      : 'fail'
  const report = {
    status,
    fixedNow,
    allowlist: allowedTrackedPrefixes,
    trackedFileCount: before.size,
    firstRunChangedPaths,
    secondRunChangedPaths,
    finalDirtyPaths,
    runs: [firstRun, secondRun],
  }
  await writeReport(report)
  return report
}

async function main() {
  const report = await checkPipelineDeterminism()
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'pass') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error) => {
    const report = {
      status: 'fail',
      fixedNow,
      reason: error instanceof Error ? error.message : String(error),
    }
    await writeReport(report).catch(() => {})
    console.error(report.reason)
    process.exit(1)
  })
}
