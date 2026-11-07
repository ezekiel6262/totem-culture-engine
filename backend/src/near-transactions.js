import { invariant } from './errors.js'

const GAS = '30000000000000'
const ONE_NEAR = '1000000000000000000000000'

function functionCall(receiverId, methodName, args, deposit = '0') {
  return {
    receiverId,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas: GAS, deposit } }]
  }
}

export function createMintTransactionPlan({ nftContractId, accountId, branchId, expiresAtMs }) {
  invariant(nftContractId, 'NFT_CONTRACT_NOT_CONFIGURED', 'TOTEM_NFT_CONTRACT_ID is not configured')
  return {
    network: 'testnet',
    operatorApproval: functionCall(nftContractId, 'approve_eligibility', {
      account_id: accountId,
      branch: branchId,
      expires_at_ms: expiresAtMs
    }),
    memberMint: functionCall(nftContractId, 'mint', {}, ONE_NEAR)
  }
}

