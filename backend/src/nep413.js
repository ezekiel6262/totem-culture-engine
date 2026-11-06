import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { decodeBase58 } from './base58.js'
import { invariant } from './errors.js'

const TAG = 2 ** 31 + 413
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function u32(value) { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out }
function borshString(value) { const bytes = Buffer.from(value, 'utf8'); return Buffer.concat([u32(bytes.length), bytes]) }
function borshOptionString(value) { return value == null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), borshString(value)]) }

export function serializeNep413Payload({ message, nonce, recipient, callbackUrl }) {
  const nonceBytes = Buffer.isBuffer(nonce) ? nonce : Buffer.from(nonce, 'base64')
  invariant(nonceBytes.length === 32, 'AUTH_NONCE_INVALID', 'NEP-413 nonce must be exactly 32 bytes')
  invariant(typeof message === 'string' && message.length > 0, 'AUTH_MESSAGE_INVALID', 'Authentication message is required')
  invariant(typeof recipient === 'string' && recipient.length > 0, 'AUTH_RECIPIENT_INVALID', 'Authentication recipient is required')
  return Buffer.concat([u32(TAG), borshString(message), nonceBytes, borshString(recipient), borshOptionString(callbackUrl)])
}

export function nep413Digest(payload) {
  return createHash('sha256').update(serializeNep413Payload(payload)).digest()
}

export function createAuthChallenge({ accountId, recipient, ttlMs = 5 * 60_000, now = Date.now() }) {
  const nonce = randomBytes(32).toString('base64')
  const state = randomBytes(24).toString('base64url')
  return {
    accountId,
    message: `Sign in to Totem as ${accountId}`,
    recipient,
    nonce,
    state,
    issuedAt: now,
    expiresAt: now + ttlMs
  }
}

export async function verifyNep413Authentication({ challenge, signedMessage, rpc, challengeStore, now = Date.now() }) {
  invariant(challenge && challenge.expiresAt >= now, 'AUTH_CHALLENGE_EXPIRED', 'Authentication challenge has expired')
  invariant(challenge.accountId === signedMessage.accountId, 'AUTH_ACCOUNT_MISMATCH', 'Signature belongs to another account')
  invariant(challenge.state === signedMessage.state, 'AUTH_STATE_MISMATCH', 'Authentication state does not match')
  invariant(!await challengeStore.isConsumed(challenge.nonce), 'AUTH_CHALLENGE_REPLAYED', 'Authentication challenge was already consumed')
  invariant(signedMessage.publicKey?.startsWith('ed25519:'), 'AUTH_KEY_UNSUPPORTED', 'Only Ed25519 NEAR keys are supported by this verifier')

  const rawKey = decodeBase58(signedMessage.publicKey.slice('ed25519:'.length))
  invariant(rawKey.length === 32, 'AUTH_KEY_INVALID', 'Ed25519 public key must be 32 bytes')
  const signature = Buffer.from(signedMessage.signature, 'base64')
  invariant(signature.length === 64, 'AUTH_SIGNATURE_INVALID', 'Ed25519 signature must be 64 bytes')
  const digest = nep413Digest({ message: challenge.message, nonce: challenge.nonce, recipient: challenge.recipient, callbackUrl: challenge.callbackUrl })
  const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]), format: 'der', type: 'spki' })
  invariant(verify(null, digest, publicKey, signature), 'AUTH_SIGNATURE_INVALID', 'NEP-413 signature is invalid')

  const accessKey = await rpc.viewAccessKey({ accountId: signedMessage.accountId, publicKey: signedMessage.publicKey, finality: 'final' })
  invariant(accessKey.permission === 'FullAccess', 'AUTH_KEY_NOT_FULL_ACCESS', 'Signing key is not a current full-access key')
  const consumed = await challengeStore.consumeOnce(challenge.nonce, now)
  invariant(consumed, 'AUTH_CHALLENGE_REPLAYED', 'Authentication challenge was already consumed')
  return { authenticated: true, accountId: signedMessage.accountId, publicKey: signedMessage.publicKey, blockHeight: accessKey.blockHeight, blockHash: accessKey.blockHash }
}

export class MemoryChallengeStore {
  #consumed = new Set()
  async isConsumed(nonce) { return this.#consumed.has(nonce) }
  async consumeOnce(nonce) { if (this.#consumed.has(nonce)) return false; this.#consumed.add(nonce); return true }
}
