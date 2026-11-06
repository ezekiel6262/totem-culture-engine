import {invariant} from './errors.js'
export function loadConfig(env=process.env){
  const production=env.NODE_ENV==='production'
  if(production){
    invariant(env.DATABASE_URL,'CONFIG_DATABASE_REQUIRED','DATABASE_URL is required in production')
    invariant(env.TOTEM_AUTH_RECIPIENT,'CONFIG_AUTH_RECIPIENT_REQUIRED','TOTEM_AUTH_RECIPIENT is required in production')
    invariant(env.NEAR_RPC_URL,'CONFIG_NEAR_RPC_REQUIRED','NEAR_RPC_URL is required in production')
  }
  return{production,port:Number(env.PORT??4210),databaseUrl:env.DATABASE_URL??null,authRecipient:env.TOTEM_AUTH_RECIPIENT??'localhost',nearRpcUrl:env.NEAR_RPC_URL??'https://rpc.mainnet.near.org',seedDemo:env.TOTEM_SEED_DEMO!=='false'&&!production}
}
