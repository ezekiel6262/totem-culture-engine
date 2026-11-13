// Signs and sends NEAR transactions without a dependency.
//
// Node 24 signs ed25519 natively, and a NEAR transaction is borsh, which is simple enough to
// write out here. That matters for this deployment: the Lambda ships as a bundle, and adding
// near-api-js to it would be a far larger change than the hundred lines below.
//
// What this is for: the backend holds keys that let it grant NFT eligibility and send a
// faucet amount of $TOTEM. It never holds a user's key, and a user still signs their own
// mint from their own wallet.
import { createHash, createPrivateKey, sign as signRaw } from 'node:crypto'
import { decodeBase58 } from './base58.js'
import { invariant } from './errors.js'

/* ---------- borsh, only the parts a function call transaction needs ---------- */

class Writer {
  #parts = []
  u8 (value) { this.#parts.push(Uint8Array.of(value)); return this }
  u32 (value) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); this.#parts.push(b); return this }
  u64 (value) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(value), true); this.#parts.push(b); return this }
  u128 (value) {
    const b = new Uint8Array(16); const view = new DataView(b.buffer); let big = BigInt(value)
    view.setBigUint64(0, big & 0xffffffffffffffffn, true)
    view.setBigUint64(8, (big >> 64n) & 0xffffffffffffffffn, true)
    this.#parts.push(b); return this
  }
  bytes (value) { this.#parts.push(Uint8Array.from(value)); return this }
  string (value) { const encoded = new TextEncoder().encode(value); return this.u32(encoded.length).bytes(encoded) }
  vecU8 (value) { return this.u32(value.length).bytes(value) }
  finish () {
    const size = this.#parts.reduce((total, part) => total + part.length, 0)
    const out = new Uint8Array(size)
    let at = 0
    for (const part of this.#parts) { out.set(part, at); at += part.length }
    return out
  }
}

// A NEAR public key is a one byte key type (0 for ed25519) followed by the 32 raw bytes.
const writePublicKey = (writer, publicKey) => writer.u8(0).bytes(decodeBase58(publicKey.replace(/^ed25519:/, '')))

// Only FunctionCall is used here. It is variant 2 of the Action enum.
const writeFunctionCall = (writer, { methodName, args, gas, deposit }) => {
  const encodedArgs = new TextEncoder().encode(JSON.stringify(args ?? {}))
  writer.u8(2).string(methodName).vecU8(encodedArgs).u64(gas).u128(deposit)
}

export function serializeTransaction ({ signerId, publicKey, nonce, receiverId, blockHash, actions }) {
  const writer = new Writer().string(signerId)
  writePublicKey(writer, publicKey)
  writer.u64(nonce).string(receiverId).bytes(decodeBase58(blockHash)).u32(actions.length)
  for (const action of actions) writeFunctionCall(writer, action)
  return writer.finish()
}

/* ---------- keys ---------- */

// A NEAR secret key is base58 of 64 bytes: the 32 byte seed followed by the public key.
// Node wants the seed wrapped in PKCS8, which for ed25519 is a fixed 16 byte prefix.
const PKCS8_ED25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])

export function privateKeyFromNear (secretKey) {
  const raw = decodeBase58(String(secretKey).replace(/^ed25519:/, ''))
  invariant(raw.length === 64 || raw.length === 32, 'SECRET_KEY_INVALID', 'A NEAR ed25519 secret key decodes to 32 or 64 bytes')
  const der = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32)
  der.set(PKCS8_ED25519_PREFIX, 0)
  der.set(raw.subarray(0, 32), PKCS8_ED25519_PREFIX.length)
  return createPrivateKey({ key: Buffer.from(der), format: 'der', type: 'pkcs8' })
}

/* ---------- signing and sending ---------- */

export class NearSigner {
  #rpcUrl; #accountId; #publicKey; #privateKey; #fetch

  constructor ({ rpcUrl, accountId, publicKey, secretKey, fetchImpl = fetch }) {
    invariant(/^https:\/\//.test(String(rpcUrl ?? '')), 'RPC_ENDPOINT_INVALID', 'The NEAR RPC endpoint must use HTTPS')
    invariant(accountId, 'SIGNER_ACCOUNT_REQUIRED', 'A signer account id is required')
    invariant(publicKey && secretKey, 'SIGNER_KEY_REQUIRED', 'A signer public and secret key are required')
    this.#rpcUrl = rpcUrl
    this.#accountId = accountId
    this.#publicKey = String(publicKey).startsWith('ed25519:') ? publicKey : `ed25519:${publicKey}`
    this.#privateKey = privateKeyFromNear(secretKey)
    this.#fetch = fetchImpl
  }

  get accountId () { return this.#accountId }

  async #rpc (method, params) {
    const response = await this.#fetch(this.#rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'totem', method, params })
    })
    const payload = await response.json()
    // A failed transaction comes back as an error with the receipt inside, so the message has
    // to carry enough to diagnose it rather than just saying the call failed.
    // invariant evaluates its message eagerly, so the detail is only built on the failing
    // path. Building it unconditionally threw on every successful call.
    if (payload.error) invariant(false, 'NEAR_RPC_FAILED', JSON.stringify(payload.error).slice(0, 400))
    return payload.result
  }

  // The nonce and the block hash both come from the chain immediately before signing, so a
  // transaction is never built against stale state.
  async #context () {
    const key = await this.#rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: this.#accountId, public_key: this.#publicKey })
    const block = await this.#rpc('block', { finality: 'final' })
    return { nonce: BigInt(key.nonce) + 1n, blockHash: block.header.hash }
  }

  async call ({ receiverId, methodName, args = {}, gas = 30_000_000_000_000n, deposit = 0n }) {
    const { nonce, blockHash } = await this.#context()
    const transaction = serializeTransaction({
      signerId: this.#accountId,
      publicKey: this.#publicKey,
      nonce,
      receiverId,
      blockHash,
      actions: [{ methodName, args, gas: BigInt(gas), deposit: BigInt(deposit) }]
    })
    // NEAR signs the sha256 of the serialized transaction, not the transaction itself.
    const digest = createHash('sha256').update(transaction).digest()
    const signature = signRaw(null, digest, this.#privateKey)

    const writer = new Writer().bytes(transaction).u8(0).bytes(signature)
    const signed = Buffer.from(writer.finish()).toString('base64')
    const outcome = await this.#rpc('broadcast_tx_commit', [signed])

    const failure = outcome?.status?.Failure
    if (failure) invariant(false, 'NEAR_CALL_FAILED', JSON.stringify(failure).slice(0, 400))
    return { transactionHash: outcome.transaction.hash, outcome }
  }
}
