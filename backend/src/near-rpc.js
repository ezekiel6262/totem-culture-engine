import { DomainError, invariant } from './errors.js'

export class NearRpcClient {
  constructor({ endpoint, fetchImpl = fetch }) {
    invariant(/^https:\/\//.test(endpoint), 'RPC_ENDPOINT_INVALID', 'NEAR RPC endpoint must use HTTPS')
    this.endpoint = endpoint
    this.fetch = fetchImpl
  }

  async call(method, params) {
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params })
    })
    if (!response.ok) throw new DomainError('RPC_HTTP_ERROR', `NEAR RPC returned HTTP ${response.status}`)
    const payload = await response.json()
    if (payload.error) throw new DomainError('RPC_RESPONSE_ERROR', 'NEAR RPC returned an error', { code: payload.error.code, message: payload.error.message })
    return payload.result
  }

  async finalBlock() {
    const result = await this.call('block', { finality: 'final' })
    return { height: result.header.height, hash: result.header.hash, timestampNanoseconds: result.header.timestamp_nanosec ?? String(result.header.timestamp) }
  }

  async callFunctionAtBlock({ contractId, methodName, args = {}, blockId }) {
    const result = await this.call('query', {
      request_type: 'call_function',
      account_id: contractId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      block_id: blockId
    })
    return { value: JSON.parse(Buffer.from(result.result).toString('utf8')), blockHeight: result.block_height, blockHash: result.block_hash }
  }

  async ftBalanceAtFinalBlock({ contractId, accountId }) {
    const block = await this.finalBlock()
    const result = await this.callFunctionAtBlock({ contractId, methodName: 'ft_balance_of', args: { account_id: accountId }, blockId: block.hash })
    invariant(/^\d+$/.test(result.value), 'RPC_BALANCE_INVALID', 'NEP-141 balance response is not an integer string')
    return { balance: result.value, blockHeight: result.blockHeight, blockHash: result.blockHash, observedAt: Math.floor(Number(BigInt(block.timestampNanoseconds) / 1_000_000n)) }
  }

  async viewAccessKey({ accountId, publicKey, finality = 'final' }) {
    const result = await this.call('query', { request_type: 'view_access_key', finality, account_id: accountId, public_key: publicKey })
    return { permission: result.permission, nonce: result.nonce, blockHeight: result.block_height, blockHash: result.block_hash }
  }
}
