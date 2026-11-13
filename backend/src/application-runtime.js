import {CoordinationService,MemoryCoordinationRepository} from './coordination.js'
import {MemoryAuthRepository,TotemAuthService} from './auth.js'
import {MemoryTotemRepository} from './repositories.js'
import {PostgresAuthRepository} from './postgres-auth-repository.js'
import {PostgresClient} from './database.js'
import {PostgresCoordinationRepository} from './postgres-coordination-repository.js'
import {PostgresTotemRepository} from './postgres-repository.js'
import {NearRpcClient} from './near-rpc.js'
import {TotemService} from './service.js'
import {createTotemApi} from './api.js'
import {TOTEM_CAMPAIGN} from './demo-campaign.js'
import {createDynamoDocumentClient,DynamoAuthRepository,DynamoCoordinationRepository,DynamoTotemRepository} from './dynamodb-repositories.js'
import {LaunchQuoteService} from './launch-quotes.js'
import {RheaLaunchPlanner} from './rhea-launch.js'
import {ArenaEconomyService} from './arena-economy.js'
import {SocialTreasuryService} from './social-treasury.js'
import {MemoryProductRepository,ensurePlatform,seedProduct} from './totem-product-repository.js'
import {DynamoProductRepository} from './dynamo-product-repository.js'
import {TotemProductService} from './totem-product.js'
import {createProductRouter} from './totem-product-api.js'
import {DynamoRateLimiter,MemoryRateLimiter} from './rate-limit.js'
import {IntentsService} from './intents.js'
export async function createApplicationRuntime(config){
  const db=config.databaseUrl?new PostgresClient(config.databaseUrl):null
  const dynamo=config.dynamoTable?createDynamoDocumentClient():null
  const repository=db?new PostgresTotemRepository(db):dynamo?new DynamoTotemRepository(dynamo,config.dynamoTable):new MemoryTotemRepository()
  const rpc=new NearRpcClient({endpoint:config.nearRpcUrl}),service=new TotemService(repository,()=>Date.now(),{nftContractId:config.nftContractId,tokenContractId:config.tokenContractId,network:config.nearNetwork,rpc})
  if(config.seedDemo&&!await repository.getLatestCampaign(TOTEM_CAMPAIGN.id))await service.createCampaign(TOTEM_CAMPAIGN)
  const authRepository=db?new PostgresAuthRepository(db):dynamo?new DynamoAuthRepository(dynamo,config.dynamoTable):new MemoryAuthRepository()
  const coordinationRepository=db?new PostgresCoordinationRepository(db):dynamo?new DynamoCoordinationRepository(dynamo,config.dynamoTable):new MemoryCoordinationRepository()
  const auth=new TotemAuthService({repository:authRepository,recipient:config.authRecipient,rpc})
  const deployment={network:config.nearNetwork,rpcUrl:config.nearRpcUrl,mainnetLaunchEnabled:config.mainnetLaunchEnabled,contractsAudited:config.contractsAudited,authorizedMainnetParent:config.authorizedMainnetParent,artifacts:{token:{path:'/contracts/totem_token.wasm',sha256:config.tokenArtifactSha256},nft:{path:'/contracts/totem_nft.wasm',sha256:config.nftArtifactSha256}}}
  const launchQuotes=new LaunchQuoteService({rpc,network:config.nearNetwork,fees:config.launchFees})
  const rheaLaunch=new RheaLaunchPlanner({rpc,network:config.nearNetwork})
  const arenaEconomy=new ArenaEconomyService({network:config.nearNetwork,agentContractId:config.arenaAgentContractId,marketContractId:config.arenaMarketContractId})
  const socialTreasury=new SocialTreasuryService({network:config.nearNetwork})
  const api=createTotemApi({repository,service,auth,coordination:new CoordinationService(coordinationRepository),deployment,launchQuotes,rheaLaunch,arenaEconomy,socialTreasury})
  const routes=new Map([['GET /api/v1/health',api.health],['GET /api/v1/readiness',api.readiness],['GET /api/v1/deployment/config',api.deploymentConfig],['POST /api/v1/launch/quote',api.launchQuote],['POST /api/v1/launch/rhea-plan',api.rheaPlan],['POST /api/v1/auth/challenge',api.createAuthChallenge],['POST /api/v1/auth/verify',api.verifyAuth],['GET /api/v1/auth/session',api.getSession],['GET /api/v1/campaigns',api.listCampaigns],['POST /api/v1/campaigns',api.createCampaign],['GET /api/v1/culture-account',api.getCultureAccount],['POST /api/v1/access/decide',api.decideAccess],['POST /api/v1/contributions',api.submitContribution],['GET /api/v1/contributions/review',api.listContributions],['POST /api/v1/contributions/review',api.reviewContribution],['POST /api/v1/contributions/finalize',api.finalizeContribution],['POST /api/v1/eligibility/evaluate',api.evaluateEligibility],['POST /api/v1/mints/prepare',api.prepareMint],['GET /api/v1/events',api.listEvents],['POST /api/v1/votes',api.vote],['POST /api/v1/arena/seasons/evolve',api.evolveArenaSeason],['POST /api/v1/arena/agents/rewards/prepare',api.prepareAgentReward],['POST /api/v1/arena/market/listings/prepare',api.prepareMarketListing],['POST /api/v1/treasury/proposals/prepare',api.prepareTreasuryProposal],['POST /api/v1/treasury/receipts/finalize',api.finalizeTreasuryReceipt]])
  const productRepository=dynamo?new DynamoProductRepository(dynamo,config.dynamoTable):new MemoryProductRepository()
  // Platform setup touches the table on cold start. A transient failure must not take the
  // whole API down with it: the product routes then answer ARENA_NOT_FOUND until it succeeds.
  try{await ensurePlatform(productRepository);if(config.seedDemo)await seedProduct(productRepository)}
  catch(error){console.error(JSON.stringify({event:'platform_setup_failed',message:error?.message??String(error)}))}
  const rateLimiter=dynamo?new DynamoRateLimiter(dynamo,config.dynamoTable):new MemoryRateLimiter()
  const intents=new IntentsService({network:'mainnet'})
  const accounts={suffix:config.accountSuffix,token:config.tokenContractId,factory:config.factoryContractId,market:config.arenaMarketContractId}
  const product=createProductRouter({product:new TotemProductService({repository:productRepository,rateLimiter,accounts,chain:{rpc,tokenContractId:config.tokenContractId,nftContractId:config.nftContractId}}),auth,intents})
  return{db,dynamo,api,routes,product}
}
