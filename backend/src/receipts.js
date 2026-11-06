import { createPublicKey, verify } from 'node:crypto'
import { canonicalize, hashRecord } from './canonical.js'
import { invariant } from './errors.js'

export function receiptPayload(receipt) {
  const { signature, ...payload } = receipt
  return payload
}

export function verifyChallengeReceipt({ receipt, issuer, expected, nonceStore, now = Date.now() }) {
  invariant(receipt.version === 1, 'RECEIPT_VERSION_UNSUPPORTED', 'Unsupported receipt version')
  invariant(receipt.issuer === issuer.id, 'RECEIPT_ISSUER_MISMATCH', 'Receipt issuer is not authorized')
  invariant(receipt.subject === expected.subject, 'RECEIPT_SUBJECT_MISMATCH', 'Receipt belongs to another subject')
  invariant(receipt.campaignId === expected.campaignId, 'RECEIPT_CAMPAIGN_MISMATCH', 'Receipt belongs to another campaign')
  invariant(receipt.actionId === expected.actionId, 'RECEIPT_ACTION_MISMATCH', 'Receipt proves another action')
  invariant(Number.isSafeInteger(receipt.issuedAt) && Number.isSafeInteger(receipt.expiresAt), 'RECEIPT_TIME_INVALID', 'Receipt timestamps are invalid')
  invariant(receipt.issuedAt <= now && receipt.expiresAt >= now, 'RECEIPT_EXPIRED', 'Receipt is expired or not active')
  invariant(typeof receipt.evidenceHash === 'string' && receipt.evidenceHash.length === 64, 'RECEIPT_EVIDENCE_INVALID', 'Evidence hash is invalid')
  invariant(!nonceStore.has(receipt.nonce), 'RECEIPT_REPLAYED', 'Receipt nonce was already consumed')

  const valid = verify(null, Buffer.from(canonicalize(receiptPayload(receipt))), createPublicKey(issuer.publicKeyPem), Buffer.from(receipt.signature, 'base64'))
  invariant(valid, 'RECEIPT_SIGNATURE_INVALID', 'Receipt signature is invalid')
  nonceStore.add(receipt.nonce)

  return { valid: true, receiptHash: hashRecord(receiptPayload(receipt)), consumedNonce: receipt.nonce, provenance: receipt.provenance }
}
