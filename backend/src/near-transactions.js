import { invariant } from './errors.js'

const GAS = '30000000000000'
const ONE_NEAR = '1000000000000000000000000'

export function mintDepositFor(price) {
  const match = String(price ?? '').replaceAll(',', '').match(/\d+(?:\.\d+)?/)
  if (!match) return ONE_NEAR
  const [whole, fraction = ''] = match[0].split('.')
  const mintPrice = BigInt(whole) * BigInt(ONE_NEAR) + BigInt((fraction + '0'.repeat(24)).slice(0, 24))
  return (mintPrice + BigInt(ONE_NEAR)).toString()
}

function functionCall(receiverId, methodName, args, deposit = '0') {
  return {
    receiverId,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas: GAS, deposit } }]
  }
}

export function createMintTransactionPlan({ nftContractId, accountId, branchId, expiresAtMs, mintDepositYocto = ONE_NEAR }) {
  invariant(nftContractId, 'NFT_CONTRACT_NOT_CONFIGURED', 'TOTEM_NFT_CONTRACT_ID is not configured')
  return {
    network: 'testnet',
    operatorApproval: functionCall(nftContractId, 'approve_eligibility', {
      account_id: accountId,
      branch: branchId,
      expires_at_ms: expiresAtMs
    }),
    memberMint: functionCall(nftContractId, 'mint', {}, mintDepositYocto)
  }
}

