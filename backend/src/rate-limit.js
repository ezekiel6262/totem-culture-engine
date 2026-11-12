// Fixed window counters for the endpoints that have to stay open to the public.
//
// A counter records attempts, not successes: a refused attempt still consumes quota, so
// a script cannot probe for free. Counters expire with the table's TTL attribute.
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'

export const DAY_MS = 24 * 60 * 60 * 1000

const windowOf = (now, windowMs) => Math.floor(now / windowMs)

export class MemoryRateLimiter {
  #counts = new Map()

  async hit({ key, limit, windowMs = DAY_MS, now = Date.now() }) {
    const bucket = windowOf(now, windowMs)
    const id = `${key}#${bucket}`
    const count = (this.#counts.get(id) ?? 0) + 1
    this.#counts.set(id, count)
    return { allowed: count <= limit, count, limit, resetAt: (bucket + 1) * windowMs }
  }
}

export class DynamoRateLimiter {
  constructor(client, tableName) { this.client = client; this.tableName = tableName }

  async hit({ key, limit, windowMs = DAY_MS, now = Date.now() }) {
    const bucket = windowOf(now, windowMs)
    const resetAt = (bucket + 1) * windowMs
    const result = await this.client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: `RATE#${key}`, sk: `WINDOW#${bucket}` },
      UpdateExpression: 'ADD #value :one SET #ttl = :ttl, entity = :entity',
      ExpressionAttributeNames: { '#value': 'value', '#ttl': 'ttl' },
      // A little past the window, so a counter cannot vanish while it still applies.
      ExpressionAttributeValues: { ':one': 1, ':ttl': Math.ceil(resetAt / 1000) + 3600, ':entity': 'rate' },
      ReturnValues: 'UPDATED_NEW'
    }))
    const count = Number(result.Attributes.value)
    return { allowed: count <= limit, count, limit, resetAt }
  }
}

// A limiter that never refuses, for callers that do not want limiting.
export class OpenRateLimiter {
  async hit({ limit }) { return { allowed: true, count: 0, limit, resetAt: 0 } }
}
