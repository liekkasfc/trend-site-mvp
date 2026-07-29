import path from 'node:path'

import {
  createReleaseRunDirectory,
  projectRoot,
  queryD1,
  readJsonIfExists,
  toNumber,
  writeJson,
  writeText,
} from './release-lib.mjs'

function normalizeAffiliatePerformance(snapshot) {
  const summary = snapshot?.summary ?? {}
  return {
    status: snapshot?.status ?? 'missing',
    generatedAt: snapshot?.generatedAt ?? null,
    dataThroughDate: snapshot?.dataThroughDate ?? null,
    summary: {
      clicks: toNumber(summary.clicks, 0),
      registrations: toNumber(summary.registrations, 0),
      ftb: toNumber(summary.ftb, 0),
      commission: toNumber(summary.commission, 0),
      clickToRegistrationRate: toNumber(summary.clickToRegistrationRate, 0),
      clickToFtbRate: toNumber(summary.clickToFtbRate, 0),
      registrationToFtbRate: toNumber(summary.registrationToFtbRate, 0),
      commissionPerClick: toNumber(summary.commissionPerClick, 0),
      commissionPerFtb: toNumber(summary.commissionPerFtb, 0),
    },
    byTrackingCode: Array.isArray(snapshot?.byTrackingCode)
      ? snapshot.byTrackingCode.map((row) => ({
          trackingCode: row.trackingCode,
          clicks: toNumber(row.clicks, 0),
          registrations: toNumber(row.registrations, 0),
          ftb: toNumber(row.ftb, 0),
          commission: toNumber(row.commission, 0),
          clickToRegistrationRate: toNumber(row.clickToRegistrationRate, 0),
          clickToFtbRate: toNumber(row.clickToFtbRate, 0),
          commissionPerClick: toNumber(row.commissionPerClick, 0),
        }))
      : [],
    unmatchedTrackingCodes: Array.isArray(snapshot?.unmatchedTrackingCodes)
      ? snapshot.unmatchedTrackingCodes
      : [],
    anomalies: Array.isArray(snapshot?.anomalies) ? snapshot.anomalies : [],
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Commercial Ops',
    '',
    `- Generated at: ${report.generatedAt}`,
    '',
    '## Summary',
    `- Asset leads: ${report.summary.assetLeads}`,
    `- Consult requests: ${report.summary.consultRequests}`,
    `- Delivered assets: ${report.summary.deliveredAssets}`,
    `- Resent assets: ${report.summary.resentAssets}`,
    `- Open follow-ups: ${report.summary.openFollowups}`,
    `- Overdue follow-ups: ${report.summary.overdueFollowups}`,
    `- Qualified events: ${report.summary.qualifiedEvents}`,
    `- Won events: ${report.summary.wonEvents}`,
    `- Revenue USD: $${report.summary.revenueUsd.toFixed(2)}`,
    `- Affiliate clicks: ${report.summary.affiliateClicks}`,
    `- Affiliate registrations: ${report.summary.affiliateRegistrations}`,
    `- Affiliate first-time buyers: ${report.summary.affiliateFtb}`,
    `- Affiliate commission USD: $${report.summary.affiliateCommissionUsd.toFixed(2)}`,
    '',
    '## Asset performance',
  ]

  for (const row of report.assetPerformance) {
    lines.push(
      `- ${row.siteSlug}/${row.assetSlug}: ${row.leadCount} lead(s), ${row.deliveredCount} delivered, ${row.openFollowups} open follow-up(s), ${row.qualifiedEvents} qualified, ${row.wonEvents} won, $${row.revenueUsd.toFixed(2)} revenue`,
    )
    if (row.strongestSourcePage) {
      lines.push(`  - strongest source page: ${row.strongestSourcePage}`)
    }
  }

  lines.push('')
  lines.push('## Affiliate performance')
  if (report.affiliatePerformance.status === 'missing') {
    lines.push('- No affiliate performance snapshot found. Run `pnpm affiliate:import:fiverr` after adding Fiverr CSV exports.')
  } else if (report.affiliatePerformance.status === 'no_data') {
    lines.push('- Affiliate report exists, but no imported rows were available yet.')
  } else {
    lines.push(
      `- ${report.affiliatePerformance.summary.clicks} click(s), ${report.affiliatePerformance.summary.registrations} registration(s), ${report.affiliatePerformance.summary.ftb} first-time buyer(s), $${report.affiliatePerformance.summary.commission.toFixed(2)} commission`,
    )
    if (report.affiliatePerformance.dataThroughDate) {
      lines.push(`- Data through: ${report.affiliatePerformance.dataThroughDate}`)
    }
    for (const row of report.affiliatePerformance.byTrackingCode.slice(0, 5)) {
      lines.push(
        `- ${row.trackingCode}: ${row.clicks} click(s), ${row.registrations} registration(s), ${row.ftb} FTB, $${row.commission.toFixed(2)} commission`,
      )
    }
    for (const anomaly of report.affiliatePerformance.anomalies) {
      lines.push(`- anomaly: ${anomaly}`)
    }
    if (report.affiliatePerformance.unmatchedTrackingCodes.length > 0) {
      lines.push(`- unmatched tracking codes: ${report.affiliatePerformance.unmatchedTrackingCodes.join(', ')}`)
    }
  }

  lines.push('')
  lines.push('## Consult activity')
  if (report.consultsBySite.length === 0) {
    lines.push('- No consult requests captured yet.')
  }
  for (const row of report.consultsBySite) {
    lines.push(`- ${row.site_slug}: ${row.request_count} consult request(s)`)
  }

  lines.push('')
  lines.push('## Follow-up queue by owner')
  if (report.followupsByOwner.length === 0) {
    lines.push('- No open owner queue rows in this snapshot.')
  }
  for (const row of report.followupsByOwner) {
    lines.push(
      `- ${row.owner_email || 'unassigned'} / ${row.status}: ${row.total} follow-up(s)`,
    )
  }

  lines.push('')
  lines.push('## Lifecycle snapshot')
  for (const row of report.assetLifecycle) {
    lines.push(`- asset lead / ${row.lifecycle_stage}: ${row.total}`)
  }
  for (const row of report.consultLifecycle) {
    lines.push(`- consult / ${row.lifecycle_stage}: ${row.total}`)
  }

  lines.push('')
  lines.push('## Commercial events')
  for (const row of report.eventSummary) {
    lines.push(`- ${row.event_type}: ${row.total} event(s), $${row.revenue_usd.toFixed(2)}`)
  }

  return `${lines.join('\n')}\n`
}

function buildAssetPerformance(assetLeadsByAsset, eventRows, followupRows, sourcePageRows) {
  const sourcePageMap = new Map()
  for (const row of sourcePageRows) {
    const key = `${row.site_slug}/${row.asset_slug}`
    const current = sourcePageMap.get(key)
    if (!current || toNumber(row.total, 0) > toNumber(current.total, 0)) {
      sourcePageMap.set(key, row)
    }
  }

  const eventAggregate = new Map()
  for (const row of eventRows) {
    const key = `${row.site_slug}/${row.asset_slug || ''}`
    const current = eventAggregate.get(key) ?? {
      qualifiedEvents: 0,
      wonEvents: 0,
      revenueUsd: 0,
    }

    if (['qualified', 'consult_booked', 'paid_offer_opened'].includes(row.event_type)) {
      current.qualifiedEvents += toNumber(row.total, 0)
    }
    if (['won', 'purchase', 'paid_pack_won'].includes(row.event_type)) {
      current.wonEvents += toNumber(row.total, 0)
    }
    current.revenueUsd += toNumber(row.revenue_usd, 0)
    eventAggregate.set(key, current)
  }

  const followupAggregate = new Map()
  for (const row of followupRows) {
    const key = `${row.site_slug}/${row.asset_slug || ''}`
    const current = followupAggregate.get(key) ?? { openFollowups: 0, overdueFollowups: 0 }
    current.openFollowups += toNumber(row.open_followups, 0)
    current.overdueFollowups += toNumber(row.overdue_followups, 0)
    followupAggregate.set(key, current)
  }

  return assetLeadsByAsset.map((row) => {
    const key = `${row.site_slug}/${row.asset_slug}`
    const event = eventAggregate.get(key) ?? {
      qualifiedEvents: 0,
      wonEvents: 0,
      revenueUsd: 0,
    }
    const followup = followupAggregate.get(key) ?? {
      openFollowups: 0,
      overdueFollowups: 0,
    }
    const strongestSourcePage = sourcePageMap.get(key)?.source_page ?? ''

    return {
      siteSlug: row.site_slug,
      assetSlug: row.asset_slug,
      leadCount: toNumber(row.lead_count, 0),
      deliveredCount: toNumber(row.delivered_count, 0),
      resendCount: toNumber(row.resend_count, 0),
      openFollowups: followup.openFollowups,
      overdueFollowups: followup.overdueFollowups,
      qualifiedEvents: event.qualifiedEvents,
      wonEvents: event.wonEvents,
      revenueUsd: event.revenueUsd,
      strongestSourcePage,
    }
  })
}

async function main() {
  const runDirectory = await createReleaseRunDirectory('commercial-ops')
  const affiliatePerformance = normalizeAffiliatePerformance(
    await readJsonIfExists(path.join(projectRoot, 'storage', 'affiliate-performance.json')),
  )
  const [assetLeadSummaryRow] = await queryD1(
    `
      select
        count(*) as asset_leads,
        sum(case when delivery_status = 'delivered' then 1 else 0 end) as delivered_assets,
        sum(coalesce(resend_count, 0)) as resent_assets
      from asset_leads
    `,
  )
  const [consultSummaryRow] = await queryD1('select count(*) as consult_requests from consult_requests')
  const [followupSummaryRow] = await queryD1(
    `
      select
        sum(case when lower(status) not in ('completed', 'won', 'lost', 'cancelled') then 1 else 0 end) as open_followups,
        sum(case when lower(status) not in ('completed', 'won', 'lost', 'cancelled') and due_at is not null and due_at < datetime('now') then 1 else 0 end) as overdue_followups
      from lead_followups
    `,
  )
  const [eventSummaryTotalRow] = await queryD1(
    `
      select
        sum(case when event_type in ('qualified', 'consult_booked', 'paid_offer_opened') then 1 else 0 end) as qualified_events,
        sum(case when event_type in ('won', 'purchase', 'paid_pack_won') then 1 else 0 end) as won_events,
        sum(coalesce(value_usd, 0)) as revenue_usd
      from commercial_events
    `,
  )

  const assetLeadsByAsset = await queryD1(
    `
      select
        site_slug,
        asset_slug,
        count(*) as lead_count,
        sum(case when delivery_status = 'delivered' then 1 else 0 end) as delivered_count,
        sum(coalesce(resend_count, 0)) as resend_count
      from asset_leads
      group by site_slug, asset_slug
      order by lead_count desc, site_slug asc, asset_slug asc
    `,
  )
  const consultsBySite = await queryD1(
    `
      select site_slug, count(*) as request_count
      from consult_requests
      group by site_slug
      order by request_count desc, site_slug asc
    `,
  )
  const assetLifecycle = await queryD1(
    `
      select lifecycle_stage, count(*) as total
      from asset_leads
      group by lifecycle_stage
      order by total desc, lifecycle_stage asc
    `,
  )
  const consultLifecycle = await queryD1(
    `
      select lifecycle_stage, count(*) as total
      from consult_requests
      group by lifecycle_stage
      order by total desc, lifecycle_stage asc
    `,
  )
  const followupsByOwner = await queryD1(
    `
      select owner_email, status, count(*) as total
      from lead_followups
      where lower(status) not in ('completed', 'won', 'lost', 'cancelled')
      group by owner_email, status
      order by owner_email asc, status asc
    `,
  )
  const followupsByAsset = await queryD1(
    `
      select
        site_slug,
        coalesce(asset_slug, '') as asset_slug,
        sum(case when lower(status) not in ('completed', 'won', 'lost', 'cancelled') then 1 else 0 end) as open_followups,
        sum(case when lower(status) not in ('completed', 'won', 'lost', 'cancelled') and due_at is not null and due_at < datetime('now') then 1 else 0 end) as overdue_followups
      from lead_followups
      group by site_slug, coalesce(asset_slug, '')
    `,
  )
  const eventSummary = await queryD1(
    `
      select
        event_type,
        count(*) as total,
        sum(coalesce(value_usd, 0)) as revenue_usd
      from commercial_events
      group by event_type
      order by total desc, event_type asc
    `,
  )
  const eventRowsByAsset = await queryD1(
    `
      select
        site_slug,
        coalesce(asset_slug, '') as asset_slug,
        event_type,
        count(*) as total,
        sum(coalesce(value_usd, 0)) as revenue_usd
      from commercial_events
      group by site_slug, coalesce(asset_slug, ''), event_type
      order by site_slug asc, asset_slug asc, event_type asc
    `,
  )
  const sourcePageRows = await queryD1(
    `
      select
        site_slug,
        asset_slug,
        source_page,
        count(*) as total
      from asset_leads
      group by site_slug, asset_slug, source_page
      order by total desc, site_slug asc, asset_slug asc
    `,
  )

  const assetPerformance = buildAssetPerformance(
    assetLeadsByAsset,
    eventRowsByAsset,
    followupsByAsset,
    sourcePageRows,
  )

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      assetLeads: toNumber(assetLeadSummaryRow?.asset_leads, 0),
      consultRequests: toNumber(consultSummaryRow?.consult_requests, 0),
      deliveredAssets: toNumber(assetLeadSummaryRow?.delivered_assets, 0),
      resentAssets: toNumber(assetLeadSummaryRow?.resent_assets, 0),
      openFollowups: toNumber(followupSummaryRow?.open_followups, 0),
      overdueFollowups: toNumber(followupSummaryRow?.overdue_followups, 0),
      qualifiedEvents: toNumber(eventSummaryTotalRow?.qualified_events, 0),
      wonEvents: toNumber(eventSummaryTotalRow?.won_events, 0),
      revenueUsd: toNumber(eventSummaryTotalRow?.revenue_usd, 0),
      affiliateClicks: affiliatePerformance.summary.clicks,
      affiliateRegistrations: affiliatePerformance.summary.registrations,
      affiliateFtb: affiliatePerformance.summary.ftb,
      affiliateCommissionUsd: affiliatePerformance.summary.commission,
      affiliateClickToRegistrationRate: affiliatePerformance.summary.clickToRegistrationRate,
      affiliateClickToFtbRate: affiliatePerformance.summary.clickToFtbRate,
      affiliateCommissionPerClick: affiliatePerformance.summary.commissionPerClick,
    },
    assetLeadsByAsset,
    consultsBySite,
    assetLifecycle,
    consultLifecycle,
    followupsByOwner,
    eventSummary: eventSummary.map((row) => ({
      ...row,
      total: toNumber(row.total, 0),
      revenue_usd: toNumber(row.revenue_usd, 0),
    })),
    assetPerformance,
    affiliatePerformance,
  }

  const markdown = renderMarkdown(report)
  const artifacts = {
    runDirectory,
    jsonReport: path.join(runDirectory, 'commercial-ops.json'),
    markdownReport: path.join(runDirectory, 'commercial-ops.md'),
    latestJson: path.join(projectRoot, 'storage', 'commercial-ops.json'),
    latestMarkdown: path.join(projectRoot, 'storage', 'commercial-ops.md'),
  }

  await writeJson(artifacts.jsonReport, report)
  await writeText(artifacts.markdownReport, markdown)
  await writeJson(artifacts.latestJson, report)
  await writeText(artifacts.latestMarkdown, markdown)

  console.log(JSON.stringify({ ...report, artifacts }, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
