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
  const mainnetLaunchEnabled=env.TOTEM_MAINNET_LAUNCH_ENABLED==='true',authorizedMainnetParent=env.TOTEM_MAINNET_PARENT_ACCOUNT??null
  if(mainnetLaunchEnabled)invariant(/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(authorizedMainnetParent??''),'CONFIG_MAINNET_PARENT_REQUIRED','A valid TOTEM_MAINNET_PARENT_ACCOUNT is required when mainnet launches are enabled')
  return{production,port:Number(env.PORT??4210),databaseUrl:env.DATABASE_URL??null,dynamoTable:env.TOTEM_DYNAMODB_TABLE??null,authRecipient:env.TOTEM_AUTH_RECIPIENT??'localhost',nearRpcUrl:env.NEAR_RPC_URL??'https://rpc.testnet.near.org',nearNetwork,tokenContractId:env.TOTEM_TOKEN_CONTRACT_ID??null,nftContractId:env.TOTEM_NFT_CONTRACT_ID??'nft.totem.testnet',arenaAgentContractId:env.TOTEM_ARENA_AGENT_CONTRACT_ID??null,arenaMarketContractId:env.TOTEM_ARENA_MARKET_CONTRACT_ID??null,tokenArtifactSha256:(env.TOTEM_TOKEN_ARTIFACT_SHA256??'2A1E7AA0902619272226ACDEFB06D51FD3BDF0196FBCC94C3F45CA9FFCECED9E').toLowerCase(),nftArtifactSha256:(env.TOTEM_NFT_ARTIFACT_SHA256??'9FBB3EF2F7E4E3682784035A466FF02CAAF766526516A6F4386DC72039587929').toLowerCase(),mainnetLaunchEnabled,authorizedMainnetParent,contractsAudited:env.TOTEM_CONTRACTS_AUDITED==='true',seedDemo:env.TOTEM_SEED_DEMO!=='false'&&!production,launchFees:{token:env.TOTEM_TOKEN_LAUNCH_FEE??'0.5',nft:env.TOTEM_NFT_LAUNCH_FEE??'0.75',twin:env.TOTEM_TWIN_LAUNCH_FEE??'1',pool:env.TOTEM_POOL_SERVICE_FEE??'0.25'}}
}
