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
import {BBC_CAMPAIGN} from './demo-campaign.js'
import {createDynamoDocumentClient,DynamoAuthRepository,DynamoCoordinationRepository,DynamoTotemRepository} from './dynamodb-repositories.js'
export async function createApplicationRuntime(config){
  const db=config.databaseUrl?new PostgresClient(config.databaseUrl):null
  const dynamo=config.dynamoTable?createDynamoDocumentClient():null
  const repository=db?new PostgresTotemRepository(db):dynamo?new DynamoTotemRepository(dynamo,config.dynamoTable):new MemoryTotemRepository(),service=new TotemService(repository)
  if(config.seedDemo&&!await repository.getLatestCampaign(BBC_CAMPAIGN.id))await service.createCampaign(BBC_CAMPAIGN)
  const authRepository=db?new PostgresAuthRepository(db):dynamo?new DynamoAuthRepository(dynamo,config.dynamoTable):new MemoryAuthRepository()
  const coordinationRepository=db?new PostgresCoordinationRepository(db):dynamo?new DynamoCoordinationRepository(dynamo,config.dynamoTable):new MemoryCoordinationRepository()
  const auth=new TotemAuthService({repository:authRepository,recipient:config.authRecipient,rpc:new NearRpcClient({endpoint:config.nearRpcUrl})})
  const api=createTotemApi({repository,service,auth,coordination:new CoordinationService(coordinationRepository)})
  const routes=new Map([['POST /api/v1/auth/challenge',api.createAuthChallenge],['POST /api/v1/auth/verify',api.verifyAuth],['GET /api/v1/auth/session',api.getSession],['POST /api/v1/campaigns',api.createCampaign],['POST /api/v1/eligibility/evaluate',api.evaluateEligibility],['POST /api/v1/mints/prepare',api.prepareMint],['GET /api/v1/events',api.listEvents],['POST /api/v1/votes',api.vote]])
  return{db,dynamo,api,routes}
}
