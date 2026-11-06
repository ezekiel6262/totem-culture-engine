import { createHash, randomBytes } from 'node:crypto'
import { createAuthChallenge, verifyNep413Authentication } from './nep413.js'
import { invariant } from './errors.js'

const tokenHash = token => createHash('sha256').update(token).digest('hex')

export class MemoryAuthRepository {
  #challenges = new Map()
  #consumed = new Set()
  #sessions = new Map()
  async saveChallenge(challenge) { this.#challenges.set(challenge.state, structuredClone(challenge)); return challenge }
  async getChallenge(state) { return structuredClone(this.#challenges.get(state) ?? null) }
  async isConsumed(nonce) { return this.#consumed.has(nonce) }
  async consumeOnce(nonce) { if (this.#consumed.has(nonce)) return false; this.#consumed.add(nonce); return true }
  async saveSession(session) { this.#sessions.set(session.tokenHash, structuredClone(session)); return session }
  async getSession(token) { return structuredClone(this.#sessions.get(tokenHash(token)) ?? null) }
}

export class TotemAuthService {
  constructor({ repository, rpc, recipient, clock = () => Date.now(), sessionTtlMs = 24 * 60 * 60_000 }) {
    this.repository = repository
    this.rpc = rpc
    this.recipient = recipient
    this.clock = clock
    this.sessionTtlMs = sessionTtlMs
  }
  async challenge(accountId) {
    invariant(typeof accountId === 'string' && accountId.length > 1, 'AUTH_ACCOUNT_REQUIRED', 'A NEAR account id is required')
    const challenge = createAuthChallenge({ accountId, recipient: this.recipient, now: this.clock() })
    await this.repository.saveChallenge(challenge)
    return challenge
  }
  async verify(signedMessage) {
    const challenge = await this.repository.getChallenge(signedMessage?.state)
    invariant(challenge, 'AUTH_CHALLENGE_NOT_FOUND', 'Authentication challenge was not found')
    const identity = await verifyNep413Authentication({ challenge, signedMessage, rpc: this.rpc, challengeStore: this.repository, now: this.clock() })
    const token = randomBytes(32).toString('base64url')
    const session = { tokenHash: tokenHash(token), accountId: identity.accountId, publicKey: identity.publicKey, issuedAt: this.clock(), expiresAt: this.clock() + this.sessionTtlMs }
    await this.repository.saveSession(session)
    return { token, expiresAt: session.expiresAt, identity }
  }
  async authenticate(token) {
    invariant(token, 'AUTH_REQUIRED', 'Authentication is required')
    const session = await this.repository.getSession(token)
    invariant(session && session.expiresAt >= this.clock(), 'AUTH_SESSION_INVALID', 'Session is invalid or expired')
    return { accountId: session.accountId, publicKey: session.publicKey }
  }
}
