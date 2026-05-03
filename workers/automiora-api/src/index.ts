export interface Env {
  DB: D1Database
  ASSET_BUCKET: R2Bucket
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_REQUIRED?: string
  PUBLIC_SITE_BASE_URL?: string
  ALLOWED_ORIGINS?: string
  EMAIL_DELIVERY_PROVIDER?: string
  RESEND_API_KEY?: string
  ASSET_FROM_EMAIL?: string
  CONSULT_FROM_EMAIL?: string
  DELIVERY_REPLY_TO?: string
  DELIVERY_TOKEN_TTL_HOURS?: string
  ASSET_OWNER_EMAIL?: string
  CONSULT_OWNER_EMAIL?: string
}

type JsonRecord = Record<string, unknown>

type TurnstileCheck = {
  success: boolean
  status: 'verified' | 'skipped' | 'failed'
  hostname?: string
  errors?: string[]
}

type EmailDispatchResult = {
  status: 'sent' | 'not_configured' | 'error'
  provider: string | null
  messageId: string | null
  deliveredAt: string | null
  error?: string
}

type TrackingPayload = {
  attributionJson: string | null
  firstTouchJson: string | null
  lastTouchJson: string | null
  ctaVariant: string | null
}

const SITE_SLUG_RE = /^[a-z0-9-]+$/
const RELATIVE_PATH_RE = /^\/[a-z0-9/_\-.]+$/i
const DEFAULT_ALLOWED_ORIGINS = [
  'https://automiora.com',
  'https://www.automiora.com',
  'http://localhost:4173',
  'http://localhost:5173',
]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return withCors(request, env, new Response(null, { status: 204 }))
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return withCors(
        request,
        env,
        json(
          {
            ok: true,
            service: 'automiora-api',
            routes: [
              '/v1/asset-leads',
              '/v1/consult-requests',
              '/v1/deliver/:token',
              '/v1/deliver/:token/resend',
              '/v1/ops/summary',
              '/v1/ops/queue',
              '/v1/ops/followups',
              '/v1/ops/events',
              '/v1/ops/entities/:type/:id',
            ],
            hasD1Binding: Boolean(env.DB),
            hasR2Binding: Boolean(env.ASSET_BUCKET),
            turnstileConfigured: Boolean((env.TURNSTILE_SECRET_KEY ?? '').trim()),
            emailProviderConfigured: isEmailProviderConfigured(env),
          },
          200,
        ),
      )
    }

    if (request.method === 'POST' && url.pathname === '/v1/asset-leads') {
      return withCors(request, env, await handleAssetLead(request, env))
    }

    if (request.method === 'POST' && url.pathname === '/v1/consult-requests') {
      return withCors(request, env, await handleConsultRequest(request, env))
    }

    if (request.method === 'GET' && url.pathname === '/v1/ops/summary') {
      return withCors(request, env, await handleOpsSummary(env))
    }

    if (request.method === 'GET' && url.pathname === '/v1/ops/queue') {
      return withCors(request, env, await handleOpsQueue(url, env))
    }

    if (request.method === 'POST' && url.pathname === '/v1/ops/followups') {
      return withCors(request, env, await handleOpsFollowupCreate(request, env))
    }

    const followupUpdateMatch = url.pathname.match(/^\/v1\/ops\/followups\/([a-zA-Z0-9_-]+)$/)
    if (request.method === 'POST' && followupUpdateMatch) {
      return withCors(request, env, await handleOpsFollowupUpdate(request, env, followupUpdateMatch[1]))
    }

    if (request.method === 'POST' && url.pathname === '/v1/ops/events') {
      return withCors(request, env, await handleOpsEventCreate(request, env))
    }

    const opsEntityMatch = url.pathname.match(/^\/v1\/ops\/entities\/([a-z-]+)\/([a-zA-Z0-9_-]+)$/)
    if (request.method === 'POST' && opsEntityMatch) {
      return withCors(
        request,
        env,
        await handleOpsEntityUpdate(request, env, opsEntityMatch[1], opsEntityMatch[2]),
      )
    }

    const resendMatch = url.pathname.match(/^\/v1\/deliver\/([a-zA-Z0-9_-]+)\/resend$/)
    if (request.method === 'POST' && resendMatch) {
      return withCors(request, env, await handleResendDelivery(env, resendMatch[1]))
    }

    const deliverMatch = url.pathname.match(/^\/v1\/deliver\/([a-zA-Z0-9_-]+)$/)
    if ((request.method === 'GET' || request.method === 'HEAD') && deliverMatch) {
      return withCors(request, env, await handleDelivery(request, env, deliverMatch[1]))
    }

    return withCors(request, env, json({ ok: false, error: 'Not found' }, 404))
  },
}

async function handleAssetLead(request: Request, env: Env): Promise<Response> {
  const payload = await readPayload(request)
  const email = normalizeEmail(payload.email)
  const role = normalizeText(payload.role, 160)
  const useCase = normalizeText(payload.useCase, 1600)
  const siteSlug = normalizeSlug(payload.siteSlug)
  const assetSlug = normalizeSlug(payload.assetSlug)
  const sourcePage = normalizeRelativePath(payload.sourcePage)
  const thankYouPath =
    normalizeRelativePath(payload.thankYouPath) ??
    `/generated-sites/${siteSlug}/asset-${assetSlug}-thank-you.html`
  const landingPath = normalizeRelativePath(payload.landingPath)

  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, 400)
  }
  if (!role) {
    return json({ ok: false, error: 'Role is required.' }, 400)
  }
  if (!useCase) {
    return json({ ok: false, error: 'Use case is required.' }, 400)
  }
  if (!siteSlug || !assetSlug) {
    return json({ ok: false, error: 'Missing site or asset slug.' }, 400)
  }

  const turnstile = await verifyTurnstile(request, env, payload.turnstileToken)
  if (!turnstile.success && envRequiresTurnstile(env)) {
    return json(
      {
        ok: false,
        error: 'Turnstile verification failed.',
        detail: turnstile.errors?.join(', ') ?? 'verification_failed',
      },
      400,
    )
  }

  const now = new Date().toISOString()
  const submissionId = crypto.randomUUID()
  const deliveryToken = randomToken()
  const ttlHours = resolveDeliveryTokenTtlHours(env)
  const expiresAt = addHours(now, ttlHours)
  const fileName = `${assetSlug}.md`
  const r2ObjectKey = `generated-sites/${siteSlug}/downloads/${fileName}`
  const fallbackDownloadUrl = new URL(
    `/generated-sites/${siteSlug}/downloads/${fileName}`,
    ensureBaseUrl(env.PUBLIC_SITE_BASE_URL),
  ).toString()
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'))
  const tracking = readTrackingPayload(payload)
  const metadataJson = safeJsonStringify({
    kind: 'asset',
    assetTitle: normalizeText(payload.assetTitle, 180),
    landingPath,
  })
  const deliveryPolicyJson = safeJsonStringify({
    issuedAt: now,
    ttlHours,
    expiresAt,
    resendEnabled: isEmailProviderConfigured(env),
    fallbackDownloadUrl,
  })

  await env.DB.prepare(
    `
      insert into asset_leads (
        id, created_at, updated_at, site_slug, asset_slug, email, role, use_case, source_page,
        thank_you_path, r2_object_key, fallback_download_url, delivery_token, expires_at,
        attribution_json, first_touch_json, last_touch_json, cta_variant, lifecycle_stage,
        lifecycle_updated_at, owner_email, followup_status, delivery_policy_json,
        turnstile_status, turnstile_hostname, ip_hash, user_agent, referer, request_origin, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      submissionId,
      now,
      now,
      siteSlug,
      assetSlug,
      email,
      role,
      useCase,
      sourcePage,
      thankYouPath,
      r2ObjectKey,
      fallbackDownloadUrl,
      deliveryToken,
      expiresAt,
      tracking.attributionJson,
      tracking.firstTouchJson,
      tracking.lastTouchJson,
      tracking.ctaVariant,
      'captured',
      now,
      trimText(env.ASSET_OWNER_EMAIL, 320),
      isEmailProviderConfigured(env) ? 'delivery_pending' : 'manual_followup',
      deliveryPolicyJson,
      turnstile.status,
      turnstile.hostname ?? null,
      ipHash,
      trimText(request.headers.get('User-Agent'), 400),
      trimText(request.headers.get('Referer'), 600),
      trimText(request.headers.get('Origin'), 300),
      metadataJson,
    )
    .run()

  const deliveryUrl = buildDeliveryUrl(env, deliveryToken)
  const assetTitle = normalizeText(payload.assetTitle, 180) || `${assetSlug} asset`
  const emailDispatch = await sendAssetDeliveryEmail(env, {
    email,
    role,
    useCase,
    assetTitle,
    assetSlug,
    siteSlug,
    deliveryUrl,
    expiresAt,
  })
  await persistAssetLeadEmailDispatch(env, submissionId, emailDispatch)
  await queueDefaultFollowup(env, {
    entityType: 'asset_lead',
    entityId: submissionId,
    siteSlug,
    assetSlug,
    ownerEmail: trimText(env.ASSET_OWNER_EMAIL, 320),
    priority: 'high',
    channel: 'email',
    dueAt: addHours(now, 48),
    nextAction:
      emailDispatch.status === 'sent'
        ? 'Confirm delivery opened, then decide whether to route this lead into a consult or deeper asset offer.'
        : 'Manual asset follow-up required because delivery email did not send automatically.',
    notes: `Role: ${role}. First use case: ${useCase}.`,
    metadata: {
      kind: 'asset_capture_followup',
      emailDeliveryStatus: emailDispatch.status,
    },
  })
  await recordCommercialEvent(env, {
    entityType: 'asset_lead',
    entityId: submissionId,
    siteSlug,
    assetSlug,
    ownerEmail: trimText(env.ASSET_OWNER_EMAIL, 320),
    eventType: 'asset_lead_captured',
    note: `Captured from ${sourcePage || landingPath || 'unknown source page'}.`,
    metadata: {
      email,
      role,
      useCase,
      emailDeliveryStatus: emailDispatch.status,
    },
  })
  await notifyOwnerOfAssetLead(env, {
    submissionId,
    email,
    role,
    useCase,
    siteSlug,
    assetSlug,
    deliveryUrl,
  })

  const redirectUrl = new URL(thankYouPath, ensureBaseUrl(env.PUBLIC_SITE_BASE_URL))
  redirectUrl.searchParams.set('lead_id', submissionId)
  redirectUrl.searchParams.set('delivery_token', deliveryToken)

  return json({
    ok: true,
    submissionId,
    deliveryToken,
    redirectUrl: redirectUrl.toString(),
    fallbackDownloadUrl,
    emailDeliveryStatus: emailDispatch.status,
    expiresAt,
  })
}

async function handleConsultRequest(request: Request, env: Env): Promise<Response> {
  const payload = await readPayload(request)
  const email = normalizeEmail(payload.email)
  const role = normalizeText(payload.role, 160)
  const workflowBottleneck = normalizeText(payload.workflowBottleneck, 1600)
  const desiredOutcome = normalizeText(payload.desiredOutcome, 1600)
  const siteSlug = normalizeSlug(payload.siteSlug)
  const thankYouPath =
    normalizeRelativePath(payload.thankYouPath) ??
    `/generated-sites/${siteSlug || 'site'}/audit-request-thank-you.html`
  const sourcePage = normalizeRelativePath(payload.sourcePage)
  const landingPath = normalizeRelativePath(payload.landingPath)

  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, 400)
  }
  if (!role) {
    return json({ ok: false, error: 'Role is required.' }, 400)
  }
  if (!workflowBottleneck) {
    return json({ ok: false, error: 'Workflow bottleneck is required.' }, 400)
  }
  if (!desiredOutcome) {
    return json({ ok: false, error: 'Desired outcome is required.' }, 400)
  }
  if (!siteSlug) {
    return json({ ok: false, error: 'Missing site slug.' }, 400)
  }

  const turnstile = await verifyTurnstile(request, env, payload.turnstileToken)
  if (!turnstile.success && envRequiresTurnstile(env)) {
    return json(
      {
        ok: false,
        error: 'Turnstile verification failed.',
        detail: turnstile.errors?.join(', ') ?? 'verification_failed',
      },
      400,
    )
  }

  const now = new Date().toISOString()
  const submissionId = crypto.randomUUID()
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'))
  const tracking = readTrackingPayload(payload)
  const metadataJson = safeJsonStringify({
    kind: 'consult',
    offerTitle: normalizeText(payload.offerTitle, 180),
    landingPath,
  })
  const deliveryPolicyJson = safeJsonStringify({
    submittedAt: now,
    acknowledgmentMode: isEmailProviderConfigured(env) ? 'email' : 'manual',
  })

  await env.DB.prepare(
    `
      insert into consult_requests (
        id, created_at, updated_at, site_slug, email, role, workflow_bottleneck, desired_outcome,
        source_page, attribution_json, first_touch_json, last_touch_json, cta_variant,
        lifecycle_stage, lifecycle_updated_at, owner_email, followup_status, delivery_policy_json,
        turnstile_status, turnstile_hostname, ip_hash, user_agent, referer, request_origin, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      submissionId,
      now,
      now,
      siteSlug,
      email,
      role,
      workflowBottleneck,
      desiredOutcome,
      sourcePage,
      tracking.attributionJson,
      tracking.firstTouchJson,
      tracking.lastTouchJson,
      tracking.ctaVariant,
      'captured',
      now,
      trimText(env.CONSULT_OWNER_EMAIL, 320),
      isEmailProviderConfigured(env) ? 'ack_pending' : 'manual_followup',
      deliveryPolicyJson,
      turnstile.status,
      turnstile.hostname ?? null,
      ipHash,
      trimText(request.headers.get('User-Agent'), 400),
      trimText(request.headers.get('Referer'), 600),
      trimText(request.headers.get('Origin'), 300),
      metadataJson,
    )
    .run()

  const consultTitle = normalizeText(payload.offerTitle, 180) || `${siteSlug} audit request`
  const emailDispatch = await sendConsultAcknowledgementEmail(env, {
    email,
    role,
    workflowBottleneck,
    desiredOutcome,
    consultTitle,
    siteSlug,
  })
  await persistConsultEmailDispatch(env, submissionId, emailDispatch)
  await queueDefaultFollowup(env, {
    entityType: 'consult_request',
    entityId: submissionId,
    siteSlug,
    ownerEmail: trimText(env.CONSULT_OWNER_EMAIL, 320),
    priority: 'high',
    channel: 'email',
    dueAt: addHours(now, 24),
    nextAction: 'Review the bottleneck, respond with one narrow recommendation, and decide whether to mark the request qualified.',
    notes: `Role: ${role}. Bottleneck: ${workflowBottleneck}. Desired outcome: ${desiredOutcome}.`,
    metadata: {
      kind: 'consult_capture_followup',
      emailDeliveryStatus: emailDispatch.status,
    },
  })
  await recordCommercialEvent(env, {
    entityType: 'consult_request',
    entityId: submissionId,
    siteSlug,
    ownerEmail: trimText(env.CONSULT_OWNER_EMAIL, 320),
    eventType: 'consult_request_captured',
    note: `Captured from ${sourcePage || landingPath || 'unknown source page'}.`,
    metadata: {
      email,
      role,
      workflowBottleneck,
      desiredOutcome,
      emailDeliveryStatus: emailDispatch.status,
    },
  })
  await notifyOwnerOfConsultLead(env, {
    submissionId,
    email,
    role,
    workflowBottleneck,
    desiredOutcome,
    siteSlug,
  })

  const redirectUrl = new URL(thankYouPath, ensureBaseUrl(env.PUBLIC_SITE_BASE_URL))
  redirectUrl.searchParams.set('lead_id', submissionId)

  return json({
    ok: true,
    submissionId,
    redirectUrl: redirectUrl.toString(),
    emailDeliveryStatus: emailDispatch.status,
  })
}

function normalizeOpsEntityType(value: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'asset-lead') {
    return {
      routeType: 'asset-lead',
      entityType: 'asset_lead',
      tableName: 'asset_leads',
      assetScoped: true,
    }
  }
  if (normalized === 'consult-request') {
    return {
      routeType: 'consult-request',
      entityType: 'consult_request',
      tableName: 'consult_requests',
      assetScoped: false,
    }
  }
  return null
}

async function queueDefaultFollowup(
  env: Env,
  payload: {
    entityType: 'asset_lead' | 'consult_request'
    entityId: string
    siteSlug: string
    assetSlug?: string | null
    ownerEmail?: string | null
    priority: string
    channel: string
    dueAt?: string | null
    nextAction: string
    notes?: string | null
    metadata?: JsonRecord
  },
): Promise<string> {
  const now = new Date().toISOString()
  const followupId = crypto.randomUUID()

  await env.DB.prepare(
    `
      insert into lead_followups (
        id, created_at, updated_at, entity_type, entity_id, site_slug, asset_slug, owner_email,
        status, priority, channel, due_at, next_action, notes, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      followupId,
      now,
      now,
      payload.entityType,
      payload.entityId,
      payload.siteSlug,
      payload.assetSlug ?? null,
      payload.ownerEmail ?? null,
      'queued',
      normalizeText(payload.priority, 40) || 'medium',
      normalizeText(payload.channel, 40) || 'email',
      payload.dueAt ?? null,
      normalizeText(payload.nextAction, 1200),
      normalizeText(payload.notes, 2000) || null,
      safeJsonStringify(payload.metadata ?? {}),
    )
    .run()

  return followupId
}

async function recordCommercialEvent(
  env: Env,
  payload: {
    entityType: 'asset_lead' | 'consult_request'
    entityId: string
    siteSlug: string
    assetSlug?: string | null
    ownerEmail?: string | null
    eventType: string
    valueUsd?: number | null
    currency?: string | null
    note?: string | null
    metadata?: JsonRecord
  },
): Promise<string> {
  const now = new Date().toISOString()
  const eventId = crypto.randomUUID()

  await env.DB.prepare(
    `
      insert into commercial_events (
        id, created_at, updated_at, entity_type, entity_id, site_slug, asset_slug,
        owner_email, event_type, value_usd, currency, note, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      eventId,
      now,
      now,
      payload.entityType,
      payload.entityId,
      payload.siteSlug,
      payload.assetSlug ?? null,
      payload.ownerEmail ?? null,
      normalizeText(payload.eventType, 80),
      payload.valueUsd ?? null,
      trimText(payload.currency, 16),
      normalizeText(payload.note, 2000) || null,
      safeJsonStringify(payload.metadata ?? {}),
    )
    .run()

  return eventId
}

async function handleOpsSummary(env: Env): Promise<Response> {
  const [assetLifecycleRows, consultLifecycleRows, followupStatusRows, ownerQueueRows, eventRows] =
    await Promise.all([
      env.DB.prepare(
        `
          select lifecycle_stage, count(*) as total
          from asset_leads
          group by lifecycle_stage
          order by total desc, lifecycle_stage asc
        `,
      ).all<{ lifecycle_stage: string; total: number | string }>(),
      env.DB.prepare(
        `
          select lifecycle_stage, count(*) as total
          from consult_requests
          group by lifecycle_stage
          order by total desc, lifecycle_stage asc
        `,
      ).all<{ lifecycle_stage: string; total: number | string }>(),
      env.DB.prepare(
        `
          select status, count(*) as total
          from lead_followups
          group by status
          order by total desc, status asc
        `,
      ).all<{ status: string; total: number | string }>(),
      env.DB.prepare(
        `
          select owner_email, status, count(*) as total
          from lead_followups
          group by owner_email, status
          order by owner_email asc, status asc
        `,
      ).all<{ owner_email: string | null; status: string; total: number | string }>(),
      env.DB.prepare(
        `
          select event_type, count(*) as total, sum(coalesce(value_usd, 0)) as revenue_usd
          from commercial_events
          group by event_type
          order by total desc, event_type asc
        `,
      ).all<{ event_type: string; total: number | string; revenue_usd: number | string | null }>(),
    ])

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    assetLifecycle: assetLifecycleRows.results ?? [],
    consultLifecycle: consultLifecycleRows.results ?? [],
    followupStatuses: followupStatusRows.results ?? [],
    ownerQueue: ownerQueueRows.results ?? [],
    commercialEvents: (eventRows.results ?? []).map((row) => ({
      eventType: row.event_type,
      total: Number(row.total ?? 0),
      revenueUsd: Number(row.revenue_usd ?? 0),
    })),
  })
}

async function handleOpsQueue(url: URL, env: Env): Promise<Response> {
  const statusFilter = normalizeText(url.searchParams.get('status'), 40)
  const ownerFilter = normalizeEmail(url.searchParams.get('owner'))
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 1), 100)
  const openOnly = String(url.searchParams.get('open_only') ?? 'true').toLowerCase() !== 'false'

  const rows = await env.DB.prepare(
    `
      select
        id, entity_type, entity_id, site_slug, asset_slug, owner_email, status, priority,
        channel, due_at, completed_at, next_action, notes, created_at, updated_at
      from lead_followups
      where (? = '' or status = ?)
        and (? = '' or lower(coalesce(owner_email, '')) = ?)
        and (? = 0 or status != 'completed')
      order by
        case when due_at is null then 1 else 0 end asc,
        due_at asc,
        created_at desc
      limit ?
    `,
  )
    .bind(
      statusFilter || '',
      statusFilter || '',
      ownerFilter || '',
      ownerFilter || '',
      openOnly ? 1 : 0,
      limit,
    )
    .all()

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    filters: {
      status: statusFilter || null,
      owner: ownerFilter || null,
      openOnly,
      limit,
    },
    rows: rows.results ?? [],
  })
}

async function handleOpsFollowupCreate(request: Request, env: Env): Promise<Response> {
  const payload = await readPayload(request)
  const entityType = normalizeOpsEntityType(String(payload.entityType ?? ''))
  const entityId = normalizeText(payload.entityId, 120)
  const siteSlug = normalizeSlug(payload.siteSlug)
  const assetSlug = normalizeSlug(payload.assetSlug)
  const ownerEmail = normalizeEmail(payload.ownerEmail)
  const priority = normalizeText(payload.priority, 40) || 'medium'
  const channel = normalizeText(payload.channel, 40) || 'email'
  const dueAt = normalizeText(payload.dueAt, 80) || null
  const nextAction = normalizeText(payload.nextAction, 1200)
  const notes = normalizeText(payload.notes, 2000) || null

  if (!entityType || !entityId || !siteSlug || !nextAction) {
    return json({ ok: false, error: 'entityType, entityId, siteSlug, and nextAction are required.' }, 400)
  }

  const followupId = await queueDefaultFollowup(env, {
    entityType: entityType.entityType,
    entityId,
    siteSlug,
    assetSlug: assetSlug || null,
    ownerEmail: ownerEmail || null,
    priority,
    channel,
    dueAt,
    nextAction,
    notes,
    metadata: {
      source: 'ops_api',
    },
  })

  return json({
    ok: true,
    followupId,
  })
}

async function handleOpsFollowupUpdate(
  request: Request,
  env: Env,
  followupId: string,
): Promise<Response> {
  const payload = await readPayload(request)
  const now = new Date().toISOString()
  const status = normalizeText(payload.status, 40)
  const ownerEmail = normalizeEmail(payload.ownerEmail)
  const priority = normalizeText(payload.priority, 40)
  const channel = normalizeText(payload.channel, 40)
  const dueAt = normalizeText(payload.dueAt, 80)
  const nextAction = normalizeText(payload.nextAction, 1200)
  const notes = normalizeText(payload.notes, 2000)
  const completedAt =
    status && ['completed', 'won', 'lost', 'cancelled'].includes(status.toLowerCase()) ? now : null

  await env.DB.prepare(
    `
      update lead_followups
      set updated_at = ?,
          status = coalesce(nullif(?, ''), status),
          owner_email = coalesce(nullif(?, ''), owner_email),
          priority = coalesce(nullif(?, ''), priority),
          channel = coalesce(nullif(?, ''), channel),
          due_at = coalesce(nullif(?, ''), due_at),
          next_action = coalesce(nullif(?, ''), next_action),
          notes = coalesce(nullif(?, ''), notes),
          completed_at = coalesce(?, completed_at)
      where id = ?
    `,
  )
    .bind(
      now,
      status || '',
      ownerEmail || '',
      priority || '',
      channel || '',
      dueAt || '',
      nextAction || '',
      notes || '',
      completedAt,
      followupId,
    )
    .run()

  return json({ ok: true, followupId })
}

async function handleOpsEventCreate(request: Request, env: Env): Promise<Response> {
  const payload = await readPayload(request)
  const entityType = normalizeOpsEntityType(String(payload.entityType ?? ''))
  const entityId = normalizeText(payload.entityId, 120)
  const siteSlug = normalizeSlug(payload.siteSlug)
  const assetSlug = normalizeSlug(payload.assetSlug)
  const ownerEmail = normalizeEmail(payload.ownerEmail)
  const eventType = normalizeText(payload.eventType, 80)
  const note = normalizeText(payload.note, 2000) || null
  const valueUsd = payload.valueUsd == null ? null : Number(payload.valueUsd)
  const currency = normalizeText(payload.currency, 16) || 'USD'

  if (!entityType || !entityId || !siteSlug || !eventType) {
    return json({ ok: false, error: 'entityType, entityId, siteSlug, and eventType are required.' }, 400)
  }

  const eventId = await recordCommercialEvent(env, {
    entityType: entityType.entityType,
    entityId,
    siteSlug,
    assetSlug: assetSlug || null,
    ownerEmail: ownerEmail || null,
    eventType,
    valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
    currency,
    note,
    metadata: {
      source: 'ops_api',
    },
  })

  return json({ ok: true, eventId })
}

async function handleOpsEntityUpdate(
  request: Request,
  env: Env,
  routeEntityType: string,
  entityId: string,
): Promise<Response> {
  const entityType = normalizeOpsEntityType(routeEntityType)
  if (!entityType) {
    return json({ ok: false, error: 'Unsupported entity type.' }, 400)
  }

  const payload = await readPayload(request)
  const now = new Date().toISOString()
  const lifecycleStage = normalizeText(payload.lifecycleStage, 80)
  const followupStatus = normalizeText(payload.followupStatus, 80)
  const ownerEmail = normalizeEmail(payload.ownerEmail)
  const note = normalizeText(payload.note, 2000)
  const eventType = normalizeText(payload.eventType, 80)
  const eventValue = payload.eventValueUsd == null ? null : Number(payload.eventValueUsd)
  const assetSlug = normalizeSlug(payload.assetSlug)
  const siteSlug = normalizeSlug(payload.siteSlug)

  await env.DB.prepare(
    `
      update ${entityType.tableName}
      set updated_at = ?,
          lifecycle_stage = coalesce(nullif(?, ''), lifecycle_stage),
          lifecycle_updated_at = ?,
          followup_status = coalesce(nullif(?, ''), followup_status),
          owner_email = coalesce(nullif(?, ''), owner_email)
      where id = ?
    `,
  )
    .bind(now, lifecycleStage || '', now, followupStatus || '', ownerEmail || '', entityId)
    .run()

  if (eventType && siteSlug) {
    await recordCommercialEvent(env, {
      entityType: entityType.entityType,
      entityId,
      siteSlug,
      assetSlug: assetSlug || null,
      ownerEmail: ownerEmail || null,
      eventType,
      valueUsd: Number.isFinite(eventValue) ? eventValue : null,
      currency: 'USD',
      note,
      metadata: {
        source: 'entity_update',
        lifecycleStage,
        followupStatus,
      },
    })
  }

  return json({
    ok: true,
    entityId,
    entityType: entityType.entityType,
  })
}

async function handleDelivery(request: Request, env: Env, deliveryToken: string): Promise<Response> {
  const isHeadRequest = request.method === 'HEAD'
  const lead = await findLeadByToken(env, deliveryToken)

  if (!lead) {
    return json({ ok: false, error: 'Delivery token not found.' }, 404)
  }

  if (isExpired(lead.expires_at)) {
    const headers = new Headers({
      'Cache-Control': 'private, max-age=0, no-store',
      'X-Delivery-Expired': 'true',
      'Content-Type': 'application/json; charset=utf-8',
    })
    if (isHeadRequest) {
      return new Response(null, { status: 410, headers })
    }
    return new Response(
      JSON.stringify(
        {
          ok: false,
          error: 'Delivery token expired.',
          resendAvailable: isEmailProviderConfigured(env),
          resendEndpoint: `/v1/deliver/${encodeURIComponent(deliveryToken)}/resend`,
        },
        null,
        2,
      ),
      { status: 410, headers },
    )
  }

  const object = await env.ASSET_BUCKET.get(lead.r2_object_key)
  if (object) {
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('Content-Type', headers.get('Content-Type') ?? 'text/markdown; charset=utf-8')
    headers.set('Content-Length', String(object.size))
    headers.set(
      'Content-Disposition',
      `attachment; filename="${sanitizeDownloadFilename(lead.asset_slug)}.md"`,
    )
    headers.set('Cache-Control', 'private, max-age=0, no-store')
    if (isHeadRequest) {
      return new Response(null, { status: 200, headers })
    }
    await markLeadDelivered(env, lead)
    return new Response(object.body, { status: 200, headers })
  }

  if (lead.fallback_download_url) {
    if (isHeadRequest) {
      return new Response(null, {
        status: 200,
        headers: new Headers({
          'Cache-Control': 'private, max-age=0, no-store',
          'X-Delivery-Mode': 'redirect',
        }),
      })
    }
    await markLeadDelivered(env, lead)
    return Response.redirect(lead.fallback_download_url, 302)
  }

  return json({ ok: false, error: 'Asset file is not available.' }, 404)
}

async function handleResendDelivery(env: Env, deliveryToken: string): Promise<Response> {
  const lead = await findLeadByToken(env, deliveryToken)
  if (!lead) {
    return json({ ok: false, error: 'Delivery token not found.' }, 404)
  }

  if (!isEmailProviderConfigured(env)) {
    return json({ ok: false, error: 'Email delivery provider is not configured.' }, 503)
  }

  const now = new Date().toISOString()
  const nextToken = randomToken()
  const expiresAt = addHours(now, resolveDeliveryTokenTtlHours(env))
  const deliveryUrl = buildDeliveryUrl(env, nextToken)

  await env.DB.prepare(
    `
      update asset_leads
      set delivery_token = ?, expires_at = ?, resend_count = coalesce(resend_count, 0) + 1,
          updated_at = ?, lifecycle_stage = 'emailed', lifecycle_updated_at = ?,
          followup_status = 'resent'
      where id = ?
    `,
  )
    .bind(nextToken, expiresAt, now, now, lead.id)
    .run()

  const metadata = parseJsonText(lead.metadata_json)
  const emailDispatch = await sendAssetDeliveryEmail(env, {
    email: lead.email,
    role: lead.role ?? '',
    useCase: lead.use_case ?? '',
    assetTitle: normalizeText(metadata.assetTitle, 180) || `${lead.asset_slug} asset`,
    assetSlug: lead.asset_slug,
    siteSlug: lead.site_slug,
    deliveryUrl,
    expiresAt,
  })
  await persistAssetLeadEmailDispatch(env, lead.id, emailDispatch)

  if (emailDispatch.status === 'error') {
    return json(
      {
        ok: false,
        error: emailDispatch.error ?? 'Email resend failed.',
      },
      502,
    )
  }

  return json({
    ok: true,
    deliveryToken: nextToken,
    deliveryUrl,
    expiresAt,
    emailDeliveryStatus: emailDispatch.status,
  })
}

async function findLeadByToken(env: Env, deliveryToken: string) {
  return env.DB.prepare(
    `
      select id, site_slug, asset_slug, email, role, use_case, r2_object_key, fallback_download_url,
             delivery_token, expires_at, metadata_json
      from asset_leads
      where delivery_token = ?
      limit 1
    `,
  )
    .bind(deliveryToken)
    .first<{
      id: string
      site_slug: string
      asset_slug: string
      email: string
      role: string | null
      use_case: string | null
      r2_object_key: string
      fallback_download_url: string
      delivery_token: string
      expires_at: string | null
      metadata_json: string | null
    }>()
}

async function markLeadDelivered(
  env: Env,
  lead: {
    id: string
    site_slug: string
    asset_slug: string
    email: string
  },
): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `
      update asset_leads
      set updated_at = ?, delivered_at = coalesce(delivered_at, ?), last_delivered_at = ?,
          delivery_status = 'delivered', delivery_count = delivery_count + 1,
          lifecycle_stage = 'engaged', lifecycle_updated_at = ?, followup_status = 'asset_opened'
      where id = ?
    `,
  )
    .bind(now, now, now, now, lead.id)
    .run()

  await recordCommercialEvent(env, {
    entityType: 'asset_lead',
    entityId: lead.id,
    siteSlug: lead.site_slug,
    assetSlug: lead.asset_slug,
    eventType: 'asset_delivered',
    note: `Asset delivered to ${lead.email}.`,
    metadata: {
      email: lead.email,
    },
  })
}

async function persistAssetLeadEmailDispatch(
  env: Env,
  leadId: string,
  dispatch: EmailDispatchResult,
): Promise<void> {
  const now = new Date().toISOString()
  const followupStatus =
    dispatch.status === 'sent'
      ? 'delivery_sent'
      : dispatch.status === 'error'
        ? 'email_failed'
        : 'manual_followup'
  const lifecycleStage = dispatch.status === 'sent' ? 'emailed' : 'captured'

  await env.DB.prepare(
    `
      update asset_leads
      set updated_at = ?, lifecycle_stage = ?, lifecycle_updated_at = ?, followup_status = ?,
          email_delivery_status = ?, email_delivery_provider = ?, email_delivery_message_id = ?,
          email_delivered_at = ?
      where id = ?
    `,
  )
    .bind(
      now,
      lifecycleStage,
      now,
      followupStatus,
      dispatch.status,
      dispatch.provider,
      dispatch.messageId,
      dispatch.deliveredAt,
      leadId,
    )
    .run()
}

async function persistConsultEmailDispatch(
  env: Env,
  leadId: string,
  dispatch: EmailDispatchResult,
): Promise<void> {
  const now = new Date().toISOString()
  const followupStatus =
    dispatch.status === 'sent'
      ? 'ack_sent'
      : dispatch.status === 'error'
        ? 'email_failed'
        : 'manual_followup'
  const lifecycleStage = dispatch.status === 'sent' ? 'acknowledged' : 'captured'

  await env.DB.prepare(
    `
      update consult_requests
      set updated_at = ?, lifecycle_stage = ?, lifecycle_updated_at = ?, followup_status = ?,
          email_delivery_status = ?, email_delivery_provider = ?, email_delivery_message_id = ?,
          email_delivered_at = ?
      where id = ?
    `,
  )
    .bind(
      now,
      lifecycleStage,
      now,
      followupStatus,
      dispatch.status,
      dispatch.provider,
      dispatch.messageId,
      dispatch.deliveredAt,
      leadId,
    )
    .run()
}

async function sendAssetDeliveryEmail(
  env: Env,
  payload: {
    email: string
    role: string
    useCase: string
    assetTitle: string
    assetSlug: string
    siteSlug: string
    deliveryUrl: string
    expiresAt: string
  },
): Promise<EmailDispatchResult> {
  const from = trimText(env.ASSET_FROM_EMAIL, 320)
  if (!from) {
    return { status: 'not_configured', provider: null, messageId: null, deliveredAt: null }
  }

  return sendTransactionalEmail(env, {
    from,
    to: payload.email,
    subject: `${payload.assetTitle} is ready`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#171717">
        <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(payload.assetTitle)} is ready</h1>
        <p style="margin:0 0 12px">Use the link below to download the asset and run the first narrow pilot while the workflow is still fresh.</p>
        <p style="margin:0 0 16px"><a href="${escapeHtml(payload.deliveryUrl)}" style="display:inline-block;padding:12px 16px;background:#dcb45c;color:#171717;text-decoration:none;font-weight:700">Download asset</a></p>
        <p style="margin:0 0 8px"><strong>Role:</strong> ${escapeHtml(payload.role || 'n/a')}</p>
        <p style="margin:0 0 8px"><strong>First use case:</strong> ${escapeHtml(payload.useCase || 'n/a')}</p>
        <p style="margin:0;color:#555">This link expires on ${escapeHtml(payload.expiresAt)}.</p>
      </div>
    `,
  })
}

async function sendConsultAcknowledgementEmail(
  env: Env,
  payload: {
    email: string
    role: string
    workflowBottleneck: string
    desiredOutcome: string
    consultTitle: string
    siteSlug: string
  },
): Promise<EmailDispatchResult> {
  const from = trimText(env.CONSULT_FROM_EMAIL, 320)
  if (!from) {
    return { status: 'not_configured', provider: null, messageId: null, deliveredAt: null }
  }

  return sendTransactionalEmail(env, {
    from,
    to: payload.email,
    subject: `${payload.consultTitle} request captured`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#171717">
        <h1 style="font-size:20px;margin:0 0 12px">Audit request captured</h1>
        <p style="margin:0 0 12px">This request is now queued for review. Keep the scope narrow so the next reply can recommend one practical move.</p>
        <p style="margin:0 0 8px"><strong>Role:</strong> ${escapeHtml(payload.role || 'n/a')}</p>
        <p style="margin:0 0 8px"><strong>Workflow bottleneck:</strong> ${escapeHtml(payload.workflowBottleneck)}</p>
        <p style="margin:0"><strong>Desired outcome:</strong> ${escapeHtml(payload.desiredOutcome)}</p>
      </div>
    `,
  })
}

async function notifyOwnerOfAssetLead(
  env: Env,
  payload: {
    submissionId: string
    email: string
    role: string
    useCase: string
    siteSlug: string
    assetSlug: string
    deliveryUrl: string
  },
) {
  const ownerEmail = trimText(env.ASSET_OWNER_EMAIL, 320)
  const from = trimText(env.ASSET_FROM_EMAIL, 320)
  if (!ownerEmail || !from) return

  await sendTransactionalEmail(env, {
    from,
    to: ownerEmail,
    subject: `New asset lead: ${payload.siteSlug}/${payload.assetSlug}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#171717">
        <p><strong>Lead id:</strong> ${escapeHtml(payload.submissionId)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>Role:</strong> ${escapeHtml(payload.role)}</p>
        <p><strong>Use case:</strong> ${escapeHtml(payload.useCase)}</p>
        <p><strong>Delivery URL:</strong> <a href="${escapeHtml(payload.deliveryUrl)}">${escapeHtml(payload.deliveryUrl)}</a></p>
      </div>
    `,
  }).catch(() => null)
}

async function notifyOwnerOfConsultLead(
  env: Env,
  payload: {
    submissionId: string
    email: string
    role: string
    workflowBottleneck: string
    desiredOutcome: string
    siteSlug: string
  },
) {
  const ownerEmail = trimText(env.CONSULT_OWNER_EMAIL, 320)
  const from = trimText(env.CONSULT_FROM_EMAIL, 320)
  if (!ownerEmail || !from) return

  await sendTransactionalEmail(env, {
    from,
    to: ownerEmail,
    subject: `New consult request: ${payload.siteSlug}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#171717">
        <p><strong>Lead id:</strong> ${escapeHtml(payload.submissionId)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
        <p><strong>Role:</strong> ${escapeHtml(payload.role)}</p>
        <p><strong>Bottleneck:</strong> ${escapeHtml(payload.workflowBottleneck)}</p>
        <p><strong>Desired outcome:</strong> ${escapeHtml(payload.desiredOutcome)}</p>
      </div>
    `,
  }).catch(() => null)
}

async function sendTransactionalEmail(
  env: Env,
  payload: {
    from: string
    to: string
    subject: string
    html: string
  },
): Promise<EmailDispatchResult> {
  const provider = String(env.EMAIL_DELIVERY_PROVIDER ?? '').trim().toLowerCase()
  if (!provider) {
    return { status: 'not_configured', provider: null, messageId: null, deliveredAt: null }
  }

  if (provider !== 'resend') {
    return {
      status: 'error',
      provider,
      messageId: null,
      deliveredAt: null,
      error: `Unsupported email provider: ${provider}`,
    }
  }

  const apiKey = trimText(env.RESEND_API_KEY, 400)
  if (!apiKey) {
    return {
      status: 'not_configured',
      provider,
      messageId: null,
      deliveredAt: null,
      error: 'Missing RESEND_API_KEY.',
    }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      reply_to: trimText(env.DELIVERY_REPLY_TO, 320) ?? undefined,
    }),
  })

  const bodyText = await response.text()
  if (!response.ok) {
    return {
      status: 'error',
      provider,
      messageId: null,
      deliveredAt: null,
      error: `${response.status} ${response.statusText}: ${bodyText}`,
    }
  }

  const parsed: { id?: string } = (() => {
    try {
      return bodyText ? (JSON.parse(bodyText) as { id?: string }) : {}
    } catch {
      return {}
    }
  })()

  return {
    status: 'sent',
    provider,
    messageId: parsed.id ?? null,
    deliveredAt: new Date().toISOString(),
  }
}

async function verifyTurnstile(
  request: Request,
  env: Env,
  tokenValue: unknown,
): Promise<TurnstileCheck> {
  const secret = (env.TURNSTILE_SECRET_KEY ?? '').trim()
  const token = trimText(tokenValue, 400)

  if (!secret) {
    return { success: true, status: 'skipped' }
  }

  if (!token) {
    return envRequiresTurnstile(env)
      ? { success: false, status: 'failed', errors: ['missing_token'] }
      : { success: true, status: 'skipped' }
  }

  const formData = new URLSearchParams()
  formData.set('secret', secret)
  formData.set('response', token)
  const remoteIp = request.headers.get('CF-Connecting-IP')
  if (remoteIp) {
    formData.set('remoteip', remoteIp)
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  })

  if (!response.ok) {
    return { success: false, status: 'failed', errors: [`turnstile_http_${response.status}`] }
  }

  const payload = (await response.json()) as {
    success?: boolean
    hostname?: string
    'error-codes'?: string[]
  }

  return {
    success: Boolean(payload.success),
    status: payload.success ? 'verified' : 'failed',
    hostname: payload.hostname,
    errors: payload['error-codes'] ?? [],
  }
}

async function readPayload(request: Request): Promise<JsonRecord> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await request.json()) as JsonRecord
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData()
    return Object.fromEntries(form.entries())
  }

  return {}
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('Origin')
  const headers = new Headers(response.headers)
  const allowedOrigin = resolveAllowedOrigin(origin, env)
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function resolveAllowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null
  const allowlist = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const finalAllowlist = allowlist.length > 0 ? allowlist : DEFAULT_ALLOWED_ORIGINS
  return finalAllowlist.includes(origin) ? origin : null
}

function envRequiresTurnstile(env: Env): boolean {
  return String(env.TURNSTILE_REQUIRED ?? '')
    .trim()
    .toLowerCase() === 'true'
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function normalizeSlug(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  return SITE_SLUG_RE.test(normalized) ? normalized : ''
}

function normalizeRelativePath(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return RELATIVE_PATH_RE.test(normalized) ? normalized : null
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function trimText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
  return normalized || null
}

function ensureBaseUrl(value: string | undefined): string {
  const normalized = String(value ?? '').trim()
  return normalized || 'https://automiora.com'
}

function buildDeliveryUrl(env: Env, deliveryToken: string): string {
  return new URL(`/v1/deliver/${deliveryToken}`, ensureApiBaseUrl(env)).toString()
}

function ensureApiBaseUrl(env: Env): string {
  const siteBase = ensureBaseUrl(env.PUBLIC_SITE_BASE_URL)
  try {
    const parsed = new URL(siteBase)
    const hostname = parsed.hostname.replace(/^www\./i, '')
    return `${parsed.protocol}//api.${hostname}`
  } catch {
    return 'https://api.automiora.com'
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function hashIp(value: string | null): Promise<string | null> {
  if (!value) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

function sanitizeDownloadFilename(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'download'
}

function isEmailProviderConfigured(env: Env): boolean {
  const provider = String(env.EMAIL_DELIVERY_PROVIDER ?? '').trim().toLowerCase()
  return provider === 'resend' && Boolean(trimText(env.RESEND_API_KEY, 400))
}

function resolveDeliveryTokenTtlHours(env: Env): number {
  const parsed = Number.parseInt(String(env.DELIVERY_TOKEN_TTL_HOURS ?? '168'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 168
}

function addHours(isoString: string, hours: number): string {
  return new Date(Date.parse(isoString) + hours * 60 * 60 * 1000).toISOString()
}

function isExpired(value: string | null): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp <= Date.now() : false
}

function readTrackingPayload(payload: JsonRecord): TrackingPayload {
  return {
    attributionJson: toStructuredJson(payload.attribution),
    firstTouchJson: toStructuredJson(payload.firstTouch),
    lastTouchJson: toStructuredJson(payload.lastTouch),
    ctaVariant: normalizeText(payload.ctaVariant, 160) || null,
  }
}

function toStructuredJson(value: unknown): string | null {
  if (value == null || value === '') return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    try {
      return safeJsonStringify(JSON.parse(normalized))
    } catch {
      return safeJsonStringify({ value: normalized })
    }
  }

  if (typeof value === 'object') {
    return safeJsonStringify(value)
  }

  return safeJsonStringify({ value })
}

function safeJsonStringify(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value)
    if (!serialized || serialized === 'null') return null
    return serialized.slice(0, 8_000)
  } catch {
    return null
  }
}

function parseJsonText(value: string | null): JsonRecord {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : {}
  } catch {
    return {}
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
