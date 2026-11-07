import {invariant} from './errors.js'
export function loadConfig(env=process.env){
  const production=env.NODE_ENV==='production'
  if(production){
    invariant(env.DATABASE_URL||env.TOTEM_DYNAMODB_TABLE,'CONFIG_DATABASE_REQUIRED','DATABASE_URL or TOTEM_DYNAMODB_TABLE is required in production')
    invariant(env.TOTEM_AUTH_RECIPIENT,'CONFIG_AUTH_RECIPIENT_REQUIRED','TOTEM_AUTH_RECIPIENT is required in production')
    invariant(env.NEAR_RPC_URL,'CONFIG_NEAR_RPC_REQUIRED','NEAR_RPC_URL is required in production')
    invariant(env.TOTEM_NFT_CONTRACT_ID,'CONFIG_NFT_CONTRACT_REQUIRED','TOTEM_NFT_CONTRACT_ID is required in production')
  }
  return{production,port:Number(env.PORT??4210),databaseUrl:env.DATABASE_URL??null,dynamoTable:env.TOTEM_DYNAMODB_TABLE??null,authRecipient:env.TOTEM_AUTH_RECIPIENT??'localhost',nearRpcUrl:env.NEAR_RPC_URL??'https://rpc.testnet.near.org',nearNetwork:env.NEAR_NETWORK??'testnet',tokenContractId:env.TOTEM_TOKEN_CONTRACT_ID??null,nftContractId:env.TOTEM_NFT_CONTRACT_ID??'nft.totem.testnet',seedDemo:env.TOTEM_SEED_DEMO!=='false'&&!production}
}
