import {
  fetchManual,
  option,
  parseArgs,
  queryD1,
  resolveApiBaseUrl,
  sqlQuote,
  toNumber,
} from './release-lib.mjs'

async function fetchLeadRecord({ leadId, deliveryToken }) {
  if (!leadId && !deliveryToken) {
    throw new Error('Either leadId or deliveryToken is required.')
  }

  const whereClause = leadId
    ? `id = ${sqlQuote(leadId)}`
    : `delivery_token = ${sqlQuote(deliveryToken)}`

  const rows = await queryD1(
    `
      select id, email, delivery_token, delivery_count, delivery_status, delivered_at
      from asset_leads
      where ${whereClause}
      limit 1
    `,
  )

  if (!rows[0]) {
    throw new Error('Lead record not found in D1.')
  }

  return {
    ...rows[0],
    delivery_count: toNumber(rows[0].delivery_count, 0),
  }
}

export async function runDeliverHeadCheck(options = {}) {
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl)
  const before = await fetchLeadRecord({
    leadId: options.leadId,
    deliveryToken: options.deliveryToken,
  })
  const deliveryUrl = `${apiBaseUrl}/v1/deliver/${before.delivery_token}`

  const headResponse = await fetchManual(deliveryUrl, { method: 'HEAD' })
  const headHeaders = {
    contentType: headResponse.headers.get('content-type') ?? '',
    contentLength: headResponse.headers.get('content-length') ?? '',
    contentDisposition: headResponse.headers.get('content-disposition') ?? '',
    allowMethods: headResponse.headers.get('access-control-allow-methods') ?? '',
  }
  const afterHead = await fetchLeadRecord({ leadId: before.id })

  const headPreserved =
    before.delivery_count === afterHead.delivery_count &&
    before.delivery_status === afterHead.delivery_status &&
    String(before.delivered_at ?? '') === String(afterHead.delivered_at ?? '')

  const result = {
    pass: headResponse.status === 200 && headPreserved,
    apiBaseUrl,
    deliveryUrl,
    before,
    head: {
      status: headResponse.status,
      headers: headHeaders,
      preservedDeliveryState: headPreserved,
    },
    afterHead,
  }

  if (options.verifyGet) {
    const getResponse = await fetch(deliveryUrl, { method: 'GET', redirect: 'follow' })
    if (!getResponse.ok) {
      throw new Error(`${getResponse.status} ${getResponse.statusText} while GET ${deliveryUrl}`)
    }
    await getResponse.arrayBuffer()

    const afterGet = await fetchLeadRecord({ leadId: before.id })
    const getIncremented =
      afterGet.delivery_count === before.delivery_count + 1 &&
      afterGet.delivery_status === 'delivered' &&
      Boolean(afterGet.delivered_at)

    result.get = {
      status: getResponse.status,
      incrementedDeliveryState: getIncremented,
      afterGet,
    }
    result.pass = result.pass && getIncremented
  }

  return result
}

async function main() {
  const args = parseArgs()
  const result = await runDeliverHeadCheck({
    apiBaseUrl: option(args, 'api-base-url'),
    leadId: option(args, 'lead-id'),
    deliveryToken: option(args, 'delivery-token'),
    verifyGet: args['verify-get'] === true,
  })

  console.log(JSON.stringify(result, null, 2))

  if (!result.pass) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
