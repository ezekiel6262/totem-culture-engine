import { invariant } from './errors.js'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const INDEX = new Map([...ALPHABET].map((char, index) => [char, index]))

export function decodeBase58(value) {
  invariant(typeof value === 'string' && value.length > 0, 'BASE58_INVALID', 'Base58 value is empty')
  let number = 0n
  for (const char of value) {
    invariant(INDEX.has(char), 'BASE58_INVALID', 'Base58 value contains an invalid character')
    number = number * 58n + BigInt(INDEX.get(char))
  }
  const bytes = []
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n }
  let zeros = 0
  while (zeros < value.length && value[zeros] === '1') zeros++
  return Buffer.from([...new Array(zeros).fill(0), ...bytes])
}

export function encodeBase58(bytes) {
  const buffer = Buffer.from(bytes)
  let number = 0n
  for (const byte of buffer) number = (number << 8n) + BigInt(byte)
  let output = ''
  while (number > 0n) { output = ALPHABET[Number(number % 58n)] + output; number /= 58n }
  for (const byte of buffer) { if (byte !== 0) break; output = '1' + output }
  return output || '1'
}
