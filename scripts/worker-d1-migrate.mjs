import path from 'node:path'

import {
  createReleaseRunDirectory,
  executeD1,
  parseArgs,
  projectRoot,
  queryD1,
  toNumber,
  writeJson,
  writeText,
} from './release-lib.mjs'

const assetLeadColumns = [
  ['attribution_json', 'text'],
  ['first_touch_json', 'text'],
  ['last_touch_json', 'text'],
  ['cta_variant', 'text'],
  ['lifecycle_stage', "text not null default 'captured'"],
  ['lifecycle_updated_at', 'text'],
  ['owner_email', 'text'],
  ['followup_status', "text not null default 'new'"],
  ['email_delivery_status', "text not null default 'not_attempted'"],
  ['email_delivery_provider', 'text'],
  ['email_delivery_message_id', 'text'],
  ['email_delivered_at', 'text'],
  ['expires_at', 'text'],
  ['last_delivered_at', 'text'],
  ['resend_count', 'integer not null default 0'],
  ['delivery_policy_json', 'text'],
]

const consultColumns = [
  ['attribution_json', 'text'],
  ['first_touch_json', 'text'],
  ['last_touch_json', 'text'],
  ['cta_variant', 'text'],
  ['lifecycle_stage', "text not null default 'captured'"],
  ['lifecycle_updated_at', 'text'],
  ['owner_email', 'text'],
  ['followup_status', "text not null default 'new'"],
  ['email_delivery_status', "text not null default 'not_attempted'"],
  ['email_delivery_provider', 'text'],
  ['email_delivery_message_id', 'text'],
  ['email_delivered_at', 'text'],
  ['delivery_policy_json', 'text'],
]

const indexStatements = [
  'create index if not exists idx_asset_leads_lifecycle_stage on asset_leads(lifecycle_stage, updated_at desc)',
  'create index if not exists idx_asset_leads_followup_status on asset_leads(followup_status, updated_at desc)',
  'create index if not exists idx_asset_leads_email_delivery_status on asset_leads(email_delivery_status, updated_at desc)',
  'create index if not exists idx_consult_requests_lifecycle_stage on consult_requests(lifecycle_stage, updated_at desc)',
  'create index if not exists idx_consult_requests_followup_status on consult_requests(followup_status, updated_at desc)',
  'create index if not exists idx_consult_requests_email_delivery_status on consult_requests(email_delivery_status, updated_at desc)',
  'create index if not exists idx_lead_followups_entity on lead_followups(entity_type, entity_id, created_at desc)',
  'create index if not exists idx_lead_followups_status on lead_followups(status, due_at asc)',
  'create index if not exists idx_lead_followups_owner on lead_followups(owner_email, status, due_at asc)',
  'create index if not exists idx_commercial_events_entity on commercial_events(entity_type, entity_id, created_at desc)',
  'create index if not exists idx_commercial_events_site_asset on commercial_events(site_slug, asset_slug, created_at desc)',
  'create index if not exists idx_commercial_events_event_type on commercial_events(event_type, created_at desc)',
]

const tableStatements = [
  {
    tableName: 'lead_followups',
    sql: `create table if not exists lead_followups (
      id text primary key,
      created_at text not null,
      updated_at text not null,
      entity_type text not null,
      entity_id text not null,
      site_slug text not null,
      asset_slug text,
      owner_email text,
      status text not null default 'queued',
      priority text not null default 'medium',
      channel text not null default 'email',
      due_at text,
      completed_at text,
      next_action text not null,
      notes text,
      metadata_json text
    )`,
  },
  {
    tableName: 'commercial_events',
    sql: `create table if not exists commercial_events (
      id text primary key,
      created_at text not null,
      updated_at text not null,
      entity_type text not null,
      entity_id text not null,
      site_slug text not null,
      asset_slug text,
      owner_email text,
      event_type text not null,
      value_usd real,
      currency text,
      note text,
      metadata_json text
    )`,
  },
]

async function readColumnNames(tableName) {
  const rows = await queryD1(`pragma table_info(${tableName})`)
  return new Set(rows.map((row) => String(row.name || '').trim()).filter(Boolean))
}

async function applyMissingColumns(tableName, columnSpecs, dryRun = false) {
  const existing = await readColumnNames(tableName)
  const added = []

  for (const [columnName, definition] of columnSpecs) {
    if (existing.has(columnName)) continue
    const sql = `alter table ${tableName} add column ${columnName} ${definition}`
    if (!dryRun) {
      await executeD1(sql)
    }
    added.push({ tableName, columnName, definition, sql })
  }

  return {
    tableName,
    existingCount: existing.size,
    added,
  }
}

async function ensureIndexes(dryRun = false) {
  const applied = []
  for (const sql of indexStatements) {
    if (!dryRun) {
      await executeD1(sql)
    }
    applied.push(sql)
  }
  return applied
}

async function ensureTables(dryRun = false) {
  const applied = []
  for (const table of tableStatements) {
    if (!dryRun) {
      await executeD1(table.sql)
    }
    applied.push(table)
  }
  return applied
}

function renderMarkdown(report) {
  const lines = [
    '# Worker D1 Migration',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    '',
    '## Supporting tables',
  ]

  for (const table of report.supportingTables) {
    lines.push(`- ${table.tableName}`)
  }

  lines.push('')
  lines.push('## Tables')

  for (const table of report.tables) {
    lines.push(`- ${table.tableName}: added ${table.added.length} column(s)`)
    for (const column of table.added) {
      lines.push(`  - ${column.columnName}: ${column.definition}`)
    }
  }

  lines.push('')
  lines.push('## Indexes')
  for (const sql of report.indexes) {
    lines.push(`- ${sql}`)
  }

  lines.push('')
  lines.push(`- Total added columns: ${toNumber(report.summary.addedColumns, 0)}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const args = parseArgs()
  const dryRun = args['dry-run'] === true
  const runDirectory = await createReleaseRunDirectory('worker-d1-migrate')
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    tables: [],
    supportingTables: [],
    indexes: [],
    summary: {
      addedColumns: 0,
    },
    artifacts: {
      runDirectory,
      jsonReport: path.join(runDirectory, 'worker-d1-migrate.json'),
      markdownReport: path.join(runDirectory, 'worker-d1-migrate.md'),
      latestJson: path.join(projectRoot, 'storage', 'worker-d1-migrate.json'),
      latestMarkdown: path.join(projectRoot, 'storage', 'worker-d1-migrate.md'),
    },
  }

  const supportingTables = await ensureTables(dryRun)
  const assetLeadResult = await applyMissingColumns('asset_leads', assetLeadColumns, dryRun)
  const consultResult = await applyMissingColumns('consult_requests', consultColumns, dryRun)
  const indexes = await ensureIndexes(dryRun)

  report.supportingTables = supportingTables
  report.tables = [assetLeadResult, consultResult]
  report.indexes = indexes
  report.summary.addedColumns = report.tables.reduce((sum, table) => sum + table.added.length, 0)

  const markdown = renderMarkdown(report)
  await writeJson(report.artifacts.jsonReport, report)
  await writeText(report.artifacts.markdownReport, markdown)
  await writeJson(report.artifacts.latestJson, report)
  await writeText(report.artifacts.latestMarkdown, markdown)

  console.log(JSON.stringify(report, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
