import {invariant} from './errors.js'
export function loadConfig(env=process.env){
  const production=env.NODE_ENV==='production'
  if(production){
    invariant(env.DATABASE_URL||env.TOTEM_DYNAMODB_TABLE,'CONFIG_DATABASE_REQUIRED','DATABASE_URL or TOTEM_DYNAMODB_TABLE is required in production')
    invariant(env.TOTEM_AUTH_RECIPIENT,'CONFIG_AUTH_RECIPIENT_REQUIRED','TOTEM_AUTH_RECIPIENT is required in production')
    invariant(env.NEAR_RPC_URL,'CONFIG_NEAR_RPC_REQUIRED','NEAR_RPC_URL is required in production')
    invariant(env.TOTEM_NFT_CONTRACT_ID,'CONFIG_NFT_CONTRACT_REQUIRED','TOTEM_NFT_CONTRACT_ID is required in production')
  }
  const nearNetwork=env.NEAR_NETWORK??'testnet'
  invariant(nearNetwork==='testnet'||nearNetwork==='mainnet','CONFIG_NEAR_NETWORK_INVALID','NEAR_NETWORK must be testnet or mainnet')
  return{production,port:Number(env.PORT??4210),databaseUrl:env.DATABASE_URL??null,dynamoTable:env.TOTEM_DYNAMODB_TABLE??null,authRecipient:env.TOTEM_AUTH_RECIPIENT??'localhost',nearRpcUrl:env.NEAR_RPC_URL??'https://rpc.testnet.near.org',nearNetwork,tokenContractId:env.TOTEM_TOKEN_CONTRACT_ID??null,nftContractId:env.TOTEM_NFT_CONTRACT_ID??'nft.totem.testnet',tokenArtifactSha256:(env.TOTEM_TOKEN_ARTIFACT_SHA256??'A5D0C35166FC2D8E331AD9DE563383333558BC29D643770F302223BC19A44B85').toLowerCase(),nftArtifactSha256:(env.TOTEM_NFT_ARTIFACT_SHA256??'F510D2A3DFE467079A273058A7DAE48ECC2B79761C5FDC2FBDBEEF7F0C354C44').toLowerCase(),mainnetLaunchEnabled:env.TOTEM_MAINNET_LAUNCH_ENABLED==='true',contractsAudited:env.TOTEM_CONTRACTS_AUDITED==='true',seedDemo:env.TOTEM_SEED_DEMO!=='false'&&!production}
}
